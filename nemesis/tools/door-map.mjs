// door-map.mjs — dump exactly what the engine puts on ONE corridor door, as JSON.
//   node nemesis/tools/door-map.mjs            -> prints a summary and writes /tmp/door.json
// The dump is the honest answer to "is that thing still on the door?": not a reading of the source,
// but the meshes buildCorridor really created, with their sizes, positions and materials.
// `tools/door-preview.py` turns the dump into a picture of the same geometry.
import fs from 'node:fs';

const here = new URL('.', import.meta.url);
const { meshes } = await import('./_stub3d.mjs');           // the headless BABYLON stub (same as the tests)
const { Scene3D } = await import(new URL('../client/scene3d.js', here));
const { createGame } = await import(new URL('../shared/engine/setup.mjs', here));

const host = {
    scene: {}, shadows: { addShadowCaster() {} }, corridorNodes: {}, roomNodes: {}, glow: null,
    M: (hex, e) => ({ hex, emissive: e == null ? 0 : e }), mergeStatic: list => list,
};
for (const m of ['makeLabel', 'makeDecal', 'setDecal', 'corridorPoints', 'roundPath', 'pos', 'posXY', 'setLabel']) {
    host[m] = (...a) => Scene3D.prototype[m].apply(host, a);
}
const state = createGame({ seed: 'door-map', mode: 'original', draft: false, players: [{ name: 'A', charId: 'soldier' }] });
const ship = state.ship;
host.cx = (ship.bounds.minX + ship.bounds.maxX) / 2;
host.cy = (ship.bounds.minY + ship.bounds.maxY) / 2;
host.shipRooms = ship.rooms;

const c = Object.values(ship.corridors)[0];
Scene3D.prototype.buildCorridor.call(host, ship, c);
const node = host.corridorNodes[c.id];
const onDoor = meshes.filter(m => m.parent && (m.parent.name === 'door' || (m.parent.parent && m.parent.parent.name === 'door')));
const out = {
    corridor: c.id, text: node.nums.join(' / '),
    meshes: onDoor.filter(m => !/^(noise|nl_|debris)/.test(m.name)).map(m => ({
        name: m.name, x: m.position.x, y: m.position.y, z: m.position.z,
        w: +m.opts.width || 0, h: +m.opts.height || 0, d: +m.opts.depth || 0,
        hex: (m.material && m.material.hex) || null,
    })),
};
fs.writeFileSync('/tmp/door.json', JSON.stringify(out, null, 1));
console.log('corridor ' + c.id + ': number «' + out.text + '», ' + out.meshes.length + ' meshes on the door → /tmp/door.json');
console.log(out.meshes.map(m => m.name).join(', '));
