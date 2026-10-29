// doors.test.mjs — the corridor doors, built headlessly against a stub BABYLON.
//   node --test nemesis/tools/doors.test.mjs
// The corridor number went through two bad versions: first a small label floating 2.2 units off to
// the side of the door, then a steel board above the beam whose number was a billboard — it always
// turned to face the camera and it glowed even without Alt. What it has to be is what the players
// actually read on the physical board: a flat stencil painted on the door frame itself, the same
// pale slate paint as the "?" printed on an unexplored room's floor, dead flat until Alt is held.
// The frame is wide and deep enough to carry that number; one central panel appears only when the
// bulkhead seals, and its red emergency lamps pulse gently until it opens again.
import test from 'node:test';
import assert from 'node:assert/strict';

const { meshes, allNodes, mat } = await import('./_stub3d.mjs');
const { Scene3D } = await import('../client/scene3d.js');
const { doorSpec } = await import('../client/tuning.js');
const { createGame } = await import('../shared/engine/setup.mjs');

// Only what buildCorridor touches: the material cache, the label factory, the merger and the map.
const host = {
    scene: {}, shadows: { addShadowCaster() {} }, corridorNodes: {}, roomNodes: {},
    M: (hex, e, extra) => mat(hex, e),
    mergeStatic: (list) => list,
    makeLabel(...args) { return Scene3D.prototype.makeLabel.apply(host, args); },
    makeDecal(...args) { return Scene3D.prototype.makeDecal.apply(host, args); },
    setDecal(...args) { return Scene3D.prototype.setDecal.apply(host, args); },
    corridorPoints(...args) { return Scene3D.prototype.corridorPoints.apply(host, args); },
    roundPath(...args) { return Scene3D.prototype.roundPath.apply(host, args); },
    pos(...args) { return Scene3D.prototype.pos.apply(host, args); },
    posXY(...args) { return Scene3D.prototype.posXY.apply(host, args); },
    setLabel(...args) { return Scene3D.prototype.setLabel.apply(host, args); },
};
const state = createGame({
    seed: 'doors', mode: 'original', draft: false,
    players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }],
});
const ship = state.ship;
host.cx = (ship.bounds.minX + ship.bounds.maxX) / 2;
host.cy = (ship.bounds.minY + ship.bounds.maxY) / 2;
host.shipRooms = ship.rooms;
const view = { roomState: {} };
for (const r of Object.values(ship.rooms)) view.roomState[r.id] = { explored: true, objects: [], tile: null };
const build = (c) => {
    meshes.length = 0; allNodes.length = 0;
    Scene3D.prototype.buildCorridor.call(host, ship, c);
    return host.corridorNodes[c.id];
};
const corridors = Object.values(ship.corridors);
const nodes = {};
for (const c of corridors) nodes[c.id] = build(c);

test('DR-01 the doorway frame is two ordinary corridor arches, not a bulky bulkhead frame', () => {
    for (const c of corridors) {
        build(c);
        const posts = meshes.filter(m => m.name === 'apost');
        assert.equal(posts.length, 4, c.id + ': two arches, two posts each');
        for (const post of posts) assert.equal(Math.abs(post.position.x), 1.2, c.id + ': posts at ±1.2, like the ribs of the tube');
        assert.equal(posts[0].opts.width, 0.24, c.id + ': the same slim post as a rib');
        assert.equal(posts[0].opts.height, 1.6, c.id + ': the same height as a rib');
        assert.equal(posts[0].opts.depth, 0.32, c.id + ': the same depth as a rib');
        const lintels = meshes.filter(m => m.name === 'alintel');
        assert.equal(lintels.length, 2, c.id + ': one lintel per arch');
        assert.ok(Math.abs(lintels[0].opts.width - 2.64) < 1e-9, c.id + ': as wide as the rib arches (' + lintels[0].opts.width + ')');
        assert.equal(lintels[0].opts.height, 0.24, c.id + ': as thick as theirs');
        // the old bulkhead frame is gone: no chunky posts, no wide beam, no slab or step in the passage
        for (const gone of ['post', 'lintel', 'dslab', 'dstep', 'sill', 'dt']) {
            assert.equal(meshes.filter(m => m.name === gone).length, 0, c.id + ': no «' + gone + '» any more');
        }
        // The arches stand symmetric about the middle of the door, close enough together that the
        // whole thing is a gateway and not a long table: arch, plate and arch together are 1.31 along
        // the passage — exactly half of the 2.62 it used to be.
        const zs = lintels.map(m => m.position.z).sort((a, b) => a - b);
        assert.ok(Math.abs(zs[0] + zs[1]) < 1e-9, c.id + ': the two arches are symmetric about the door');
        const postD = posts[0].opts.depth;
        const doorLen = zs[1] - zs[0] + postD;
        assert.ok(Math.abs(doorLen - 1.31) < 1e-6, c.id + ': the door is half its old length (' + doorLen.toFixed(2) + ' м)');
        // the plate: exactly the lintels' width, height and level — one frame, not a roof on legs
        const plate = meshes.find(m => m.name === 'aplate');
        assert.ok(plate, c.id + ': a plate bridges the arches');
        assert.equal(plate.opts.width, lintels[0].opts.width, c.id + ": the plate is the arches' width");
        assert.equal(plate.opts.height, lintels[0].opts.height, c.id + ': and their height');
        assert.equal(plate.position.y, lintels[0].position.y, c.id + ': flush with them');
        assert.equal(plate.position.x, 0, c.id + ': centred');
        assert.ok(plate.opts.depth > 0.4 && plate.opts.depth <= zs[1] - zs[0] - 0.3, c.id + ': it spans the gap and no more');
        const closedDoor = meshes.filter(m => m.name === 'dclosed');
        assert.equal(closedDoor.length, 1, c.id + ': one solid panel, not a pair of swinging leaves');
        assert.equal(closedDoor[0].opts.width, doorSpec().openW, c.id + ': the panel fits exactly between the posts');
        assert.equal(closedDoor[0].opts.height, doorSpec().postH, c.id + ': the panel reaches from deck to lintel');
        assert.equal(closedDoor[0].position.x, 0, c.id + ': the panel is centred in the opening');
        assert.equal(closedDoor[0].position.z, 0, c.id + ': the panel closes across the middle of the doorway');
        assert.equal(closedDoor[0].isEnabled(), false, c.id + ': the panel starts hidden until a closed state is applied');
        // Nothing sticks out over the sides: every part of the frame stays within the arch span.
        const span = lintels[0].opts.width / 2;
        for (const m of meshes) {
            if (!/^(apost|alintel|aplate|alamp)/.test(m.name)) continue;
            assert.ok(Math.abs(m.position.x) + m.opts.width / 2 <= span + 1e-9, c.id + ': ' + m.name + ' never grows past the arch');
        }
        // And nothing is bolted to the sides of the door at all: the two arches and the plate are the
        // whole doorway. (The glowing side strips that used to hang on the posts are gone.)
        assert.equal(meshes.filter(m => m.name === 'aband').length, 0, c.id + ': no side strips on the door');
        for (const m of meshes) {
            assert.ok(!/^(aband|bplate|side|strip|wing|flap)$/.test(m.name), c.id + ': no plate bolted to the door');
        }
        // a head clears the lintel: the arches are not squat
        assert.ok(lintels[0].position.y - lintels[0].opts.height / 2 >= 1.5, c.id + ': the doorway is walkable');
    }
});

test('DR-02 the number is a flat stencil on the plate between the arches', () => {
    for (const c of corridors) {
        build(c);
        const n = host.corridorNodes[c.id];
        assert.ok(n.decal, c.id + ': the corridor has a number stencil');
        assert.equal(n.decals, undefined, c.id + ': one number, one stencil — not a copy on each half of the plate');
        const decal = n.decal;
        // flat on the plate, facing up — the very same orientation as the "?" on a room's floor
        assert.equal(decal.billboardMode, 0, c.id + ': the stencil never turns to the camera');
        assert.equal(decal.rotation.x, Math.PI / 2, c.id + ': the stencil lies flat');
        assert.ok(decal.rotation.y === 0, c.id + ': it only spins in its own plane');
        assert.ok(decal.rotation.z === 0 || Math.abs(decal.rotation.z) === Math.PI, c.id + ': it only spins in its own plane');
        assert.equal(decal.position.x, 0, c.id + ': centred across the plate');
        assert.equal(decal.position.z, 0, c.id + ': centred along the plate');
        // The face of a Babylon plane points along its local -Z. A rotation.x of +PI/2 turns that
        // normal straight up, so the paint is read from above and never through the back of the
        // plane (a back face is drawn mirrored; that is what made the digits unreadable).
        const spin = (rx, rz, v) => {
            const cz = Math.cos(rz), sz = Math.sin(rz);
            const x = v.x * cz - v.y * sz, y = v.x * sz + v.y * cz;
            const cx = Math.cos(rx), sx = Math.sin(rx);
            return { x, y: y * cx - v.z * sx, z: y * sx + v.z * cx };
        };
        const normal = spin(decal.rotation.x, decal.rotation.z, { x: 0, y: 0, z: -1 });
        assert.ok(normal.y > 0.999, c.id + ': the painted face looks up, so it is never seen mirrored (n.y=' + normal.y.toFixed(2) + ')');
        // it lies on the plate's own top face, and the plate is the arches' steel
        const plate = meshes.find(m => m.name === 'aplate');
        const plateTop = plate.position.y + plate.opts.height / 2;
        assert.ok(decal.position.y >= plateTop && decal.position.y <= plateTop + 0.03,
            c.id + ': the stencil lies on the plate (' + decal.position.y.toFixed(3) + ' vs ' + plateTop.toFixed(3) + ')');
        assert.equal(plate.material.hex, meshes.find(m => m.name === 'apost').material.hex,
            c.id + ': the plate is the same steel as the arches');
        // The number keeps its printed size: the plate's depth is not what sizes the digits (the
        // door was shortened, the digits were not). It is only ever as wide as the plate allows.
        assert.ok(decal.opts.width <= plate.opts.width - 0.4,
            c.id + ': the stencil is narrower than the plate (' + decal.opts.width.toFixed(2) + ' on ' + plate.opts.width + ')');
        assert.ok(Math.abs(decal.opts.width / decal.opts.height - 2) < 1e-9, c.id + ': the stencil keeps its 2:1 canvas');
        assert.ok(Math.abs(decal.opts.width - 1.9008) < 1e-3, c.id + ': digits at their printed size, 1.9 wide (' + decal.opts.width.toFixed(4) + ')');
        // nothing is bolted on top of the frame: no old board, no sign, no floating screen
        assert.equal(meshes.filter(m => m.name === 'dplate').length, 0, c.id + ': no plate/screen on the frame');
        assert.equal(allNodes.filter(a => /^sign_/.test(a.name)).length, 0, c.id + ': no separate board node');
        assert.equal(meshes.filter(m => m.name === 'se').length, 0, c.id + ': no floating frame around it');
    }
});

test('DR-03 the number is printed in the same paint as the "?", and Alt turns it neon', () => {
    const c = corridors[0];
    const n = build(c);
    const numsOf = (roomId) => { const e = ship.rooms[roomId].exits.find(x => x.corridor === c.id); return (e.nums && e.nums.length ? e.nums : [e.num]).filter(x => x); };
    const want = numsOf(c.a).join(' / ');
    const painted = n.decal.metadata.dt.rec.filter(r => r.text === want);
    const printed = painted.filter(r => r.kind === 'fill');
    assert.equal(printed.length, 1, 'the number is painted on the beam: "' + want + '"');
    assert.ok(printed[0].size >= 150, 'the digits fill the beam (' + printed[0].size + 'px)');
    assert.equal(printed[0].blur, 0, 'the printed number does not glow');
    assert.equal(printed[0].fill, '#56687c', 'it is the same slate paint as the "?" on a room floor');
    assert.equal(n.decal.isEnabled(), true, 'the number is on the door without Alt');
    // on the beam's own light steel the paint needs an edge, or it disappears in the lighting
    const edge = painted.filter(r => r.kind === 'stroke');
    assert.equal(edge.length, 1, 'the paint is outlined');
    assert.equal(edge[0].stroke, '#1b2632', 'a dark edge under the paint');
    assert.ok(edge[0].width >= 3, 'the edge is thick enough to read (' + edge[0].width.toFixed(1) + ')');

    Scene3D.prototype.setAlt.call(host, true);
    const neon = n.decal.metadata.dt.rec.filter(r => r.text === want && r.kind === 'fill');
    assert.ok(neon.length >= 1, 'the number is repainted for Alt');
    assert.ok(neon.some(r => r.blur >= 20), 'the Alt number glows');
    assert.ok(neon.some(r => /^#/.test(r.fill) && r.fill !== printed[0].fill), 'the Alt number changes colour');

    Scene3D.prototype.setAlt.call(host, false);
    const back = n.decal.metadata.dt.rec.filter(r => r.text === want && r.kind === 'fill');
    assert.ok(back.length >= 1 && back.every(r => r.blur < 20), 'releasing Alt returns the printed look');
    assert.equal(back[0].fill, '#56687c', 'and the same paint');
});

test('DR-04 one central door panel appears only when closed; no side leaves are built', () => {
    for (const c of corridors) {
        const n = build(c);
        const panels = meshes.filter(m => /^(dclosed|dleft|dright|dside|panel|ps|pivot|wing|flap)$/.test(m.name));
        assert.deepEqual(panels.map(m => m.name), ['dclosed'], c.id + ': the only door panel is the single central leaf');
        assert.equal(n.closedDoor, panels[0], c.id + ': the corridor tracks that one closed panel');
        assert.ok(!n.closedDoor.isEnabled(), c.id + ': the panel is absent while the door is open');
        for (const gone of ['panels', 'pivots', 'panelSwing']) assert.equal(n[gone], undefined, c.id + ': no hinged side-leaf state (' + gone + ')');
        for (const gone of ['panel', 'ps', 'pivot', 'dleft', 'dright', 'dside', 'wing', 'flap']) {
            assert.equal(allNodes.filter(a => a.name === gone).length, 0, c.id + ': no «' + gone + '» node either');
        }
        // The frame, the one central panel, the fixtures, and the number stencil are the only door parts.
        const allowed = /^(apost|abrk|alintel|aplate|alamp|apipe|dclosed|lem|lel|debris|noise|cn_|nl_)/;
        for (const m of meshes) {
            const onDoor = m.parent && (m.parent.name === 'door' || (m.parent.parent && m.parent.parent.name === 'door'));
            assert.ok(!onDoor || allowed.test(m.name), c.id + ': «' + m.name + '» не место на двери');
        }

        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'closed', noise: true }));
        assert.ok(n.closedDoor.isEnabled(), c.id + ': the central panel fills the opening when sealed');
        assert.ok(n.lamps.every(l => l.isEnabled()), c.id + ': a sealed doorway lights its red lenses');
        assert.equal(n.lampActive, true, c.id + ': the closed-door pulse is active');
        assert.ok(!n.noiseLabel.isEnabled(), c.id + ': noise never adds a floating speaker icon');

        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'open' }));
        assert.ok(!n.closedDoor.isEnabled(), c.id + ': opening the door removes the whole panel');
        assert.ok(n.lamps.every(l => !l.isEnabled()), c.id + ': the open doorway has no glowing red lenses');
        assert.equal(n.lampActive, false, c.id + ': the pulse stops while open');

        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'destroyed' }));
        assert.ok(!n.closedDoor.isEnabled(), c.id + ': a destroyed door has no intact panel');
        assert.ok(n.debris.every(d => d.isEnabled()), c.id + ': a wrecked doorway is strewn with debris');
    }
});

test('DR-05 the red lenses give a modest periodic pulse only while the door is closed', () => {
    const pulsePeriod = 2 * Math.PI / 2.4;
    for (const c of corridors) {
        const n = build(c);
        const lenses = n.lamps;
        assert.equal(lenses.length, 4, c.id + ': a lamp on each post, on both faces of the doorway');
        for (const l of lenses) assert.ok(!l.isEnabled(), c.id + ': the red lens is off while the door stands open');
        assert.ok(n.lampMaterial, c.id + ': the lenses have a dynamic per-door material');
        for (const l of lenses) assert.equal(l.material, n.lampMaterial, c.id + ': all four lenses share one pulse');
        // the fixture itself is always there: a dark housing on the post, not a glowing lamp
        const bodies = meshes.filter(m => m.name === 'lem');
        assert.equal(bodies.length, 4, c.id + ': four lamp housings');
        for (const b of bodies) assert.equal(b.material.hex, '#2a3038', c.id + ': dark steel housing');
        // the lamps hang in the top corners of the opening, above the central panel
        for (const l of lenses) {
            assert.ok(Math.abs(l.position.x) > 0.8 && Math.abs(l.position.x) < 1.05, c.id + ': the lens sits on the post');
            assert.ok(l.position.y > 1.2 && l.position.y < 1.6, c.id + ': it hangs under the lintel');
            const archZ = Math.abs(meshes.find(m => m.name === 'alintel').position.z);
            assert.ok(Math.abs(l.position.z) > archZ + 0.32 / 2, c.id + ': on the outer face of an arch, clear of the panel');
        }

        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'closed' }));
        assert.ok(n.closedDoor.isEnabled(), c.id + ': closing the door shows its panel');
        assert.ok(lenses.every(l => l.isEnabled()), c.id + ': closing the door lights its warning lenses');

        // The material remains clearly luminous at the old 1.6 peak, with only a small rise from 1.4.
        n.lampPhase = 0;
        const animateLamps = time => Scene3D.prototype.animateDoorLamps.call({ corridorNodes: { [c.id]: n } }, time);
        animateLamps(0);
        const dim = n.lampMaterial.emissiveColor.r;
        animateLamps(Math.PI / (2 * 2.4));
        const bright = n.lampMaterial.emissiveColor.r;
        animateLamps(Math.PI / (2 * 2.4) + pulsePeriod);
        const repeated = n.lampMaterial.emissiveColor.r;
        assert.ok(dim >= 1.4 && bright <= 1.6, c.id + ': the lens stays bright red without excessive emission');
        assert.ok(bright > dim, c.id + ': the closed-door light periodically gets brighter');
        assert.ok(bright / dim < 1.16, c.id + ': the pulse is gentle, not a strong flash');
        assert.ok(Math.abs(repeated - bright) < 1e-9, c.id + ': the brightness pulse repeats');

        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'open' }));
        assert.ok(!n.closedDoor.isEnabled(), c.id + ': no door panel remains when open');
        assert.ok(lenses.every(l => !l.isEnabled()), c.id + ': an open door shows no red at all');
        const held = n.lampMaterial.emissiveColor.r;
        animateLamps(Math.PI / (2 * 2.4));
        assert.equal(n.lampMaterial.emissiveColor.r, held, c.id + ': the pulse freezes while the lenses are hidden');
    }
});

test('DR-06 no new pickable meshes: the stencil, the beam and the lamps are decoration', () => {
    for (const c of corridors) {
        build(c);
        for (const m of meshes) {
            if (m.name === 'c' || m.name === 'pad' || m.name === 'jp' || m.name === 'pp') continue;   // corridor body
            assert.equal(m.isPickable, false, c.id + ': ' + m.name + ' must not steal a click from the board');
        }
    }
});

test('DR-07 each room reads its OWN numbers on the doors: no foreign digits, no repeats', () => {
    // The complaint that started this: standing in one room, several corridors were marked "2" and
    // several "3". One stencil carried room `a`'s numbers to both ends, so room `b` read digits that
    // belong to somebody else. A printed room numbers its own exits 1..4 — with a repeat only where
    // the board itself prints two digits on one doorway ("3 4").
    for (const c of corridors) build(c);
    for (const room of Object.values(ship.rooms)) {
        const read = [];          // what a player in this room sees over their doorways
        for (const e of room.exits) {
            const n = host.corridorNodes[e.corridor];
            assert.ok(n, room.id + ': corridor ' + e.corridor + ' is built');
            const exit = room.exits.find(x => x.corridor === e.corridor);
            const want = (exit.nums && exit.nums.length ? exit.nums : [exit.num]).filter(x => x);
            // one stencil, so both ends of a passage must agree: a room reads its own digits and
            // the room across the door reads the very same ones (agreeNumbers guarantees it).
            assert.deepEqual(n.nums, want, room.id + ': the stencil by ' + e.corridor + ' shows this room\'s numbers');
            read.push(want.join('+'));
        }
        // Every number 1..4 appears exactly once for this room, like on the board: across the
        // doorways, plus the hatch when the room has a technical corridor.
        const all = [...read.join('+').split('+'), ...(room.techNums || [])].filter(Boolean).map(Number).sort();
        assert.deepEqual(all, [1, 2, 3, 4], room.id + ': the four noise numbers are dealt out once (' + all.join(',') + ')');
    }
});

test('DR-08 on the printed board every room deals its four noise numbers out once', async () => {
    // A room numbers its own exits 1..4 clockwise; a room with fewer corridors gives one doorway two
    // digits ("3 4") and a room with a technical hatch puts the missing number on the hatch. So the
    // four numbers add up exactly once per room — the invariant that kills "several 2s and several
    // 3s" at the source. The cockpit used to read "2 3 3 4": the hand-written "002 is 3" left the
    // auto-numbered 3 on the doorway to 004 as well.
    const { originalShip } = await import('../shared/ship.mjs');
    const ship = originalShip();
    assert.equal(Object.keys(ship.rooms).length, 21, 'the printed board has 21 rooms');
    for (const r of Object.values(ship.rooms)) {
        const nums = [...r.exits.flatMap(e => (e.nums && e.nums.length ? e.nums : [e.num])), ...(r.techNums || [])]
            .filter(Boolean).sort();
        assert.deepEqual(nums, [1, 2, 3, 4],
            'комната ' + r.id + ' должна раздавать номера 1..4 ровно по разу, а раздаёт ' + nums.join(','));
        for (const e of r.exits) {
            const list = e.nums && e.nums.length ? e.nums : [e.num];
            assert.ok(list.every(n => n >= 1 && n <= 4), 'комната ' + r.id + ': номер в диапазоне 1..4');
            assert.equal(e.num, list[0], 'комната ' + r.id + ': основной номер — первый из пары');
        }
    }
    // the cockpit, checked against the printed board: 002 is 3, 003 is the pair "1 2", 004 is 4
    const cockpit = Object.fromEntries(ship.rooms['001'].exits.map(e => [e.to, e.nums]));
    assert.deepEqual(cockpit, { '002': [3], '003': [1, 2], '004': [4] });
});

test('DR-07 the post at a bend belongs to the half of that bend, never to the always-visible shell', () => {
    // ru: стойка поворота (`jp`) раньше ложилась в общий список статики коридора, а он виден всегда.
    // Пока комната на том конце лежала лицом вниз, её арки были скрыты — и на доске оставалась одна
    // тёмная балка 0.4 x 1.9 посреди пустого коридора («какие-то одиночные балки»). Теперь стойка
    // строится в список той половины, к повороту которой она относится.
    let posts = 0;
    for (const c of corridors) {
        const n = build(c);
        const built = meshes.filter(m => m.name === 'jp');
        posts += built.length;
        const inHalves = n.ribsA.concat(n.ribsB).filter(m => m.name === 'jp').length;
        assert.equal(inHalves, built.length, c.id + ': все стойки поворота лежат в половинах арок');
        // and nothing that tall is left among the parts that are always on
        assert.equal(meshes.filter(m => m.name === 'jp' && !n.ribsA.includes(m) && !n.ribsB.includes(m)).length, 0,
            c.id + ': ни одна стойка не осталась в общей статике');
    }
    assert.ok(posts > 0, 'на доске есть коридоры с поворотами');
});
