// door-map.mjs — dump exactly what the engine shows on ONE corridor door, as JSON.
//   node nemesis/tools/door-map.mjs            -> open doorway
//   node nemesis/tools/door-map.mjs --closed   -> sealed doorway, central panel and red lamps
// The dump records buildCorridor/updateCorridor output, including the active state and visibility.
// `tools/door-preview.py` turns the dump into a picture of that same state.
import fs from 'node:fs';

const here = new URL('.', import.meta.url);
const { meshes } = await import('./_stub3d.mjs');           // the headless BABYLON stub (same as the tests)
const { Scene3D } = await import(new URL('../client/scene3d.js', here));
const { doorSpec } = await import(new URL('../client/tuning.js', here));
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
const doorState = process.argv.includes('--closed') ? 'closed' : 'open';
Scene3D.prototype.buildCorridor.call(host, ship, c);
const node = host.corridorNodes[c.id];
const roomState = Object.fromEntries(Object.keys(ship.rooms).map(id => [id, { explored: true }]));
Scene3D.prototype.updateCorridor.call(host, { roomState }, Object.assign({}, c, { door: doorState }));
const onDoor = meshes.filter(m => m.parent && (m.parent.name === 'door' || (m.parent.parent && m.parent.parent.name === 'door')));
const out = {
    corridor: c.id, door: doorState, text: node.nums.join(' / '),
    meshes: onDoor.filter(m => !/^(noise|nl_|debris)/.test(m.name)).map(m => ({
        name: m.name, x: m.position.x, y: m.position.y, z: m.position.z,
        w: +m.opts.width || 0, h: +m.opts.height || 0, d: +m.opts.depth || 0,
        enabled: m.isEnabled(),
        hex: (m.material && m.material.hex) || (m.name === 'lel' ? doorSpec().lamp : null),
    })),
};
fs.writeFileSync('/tmp/door.json', JSON.stringify(out, null, 1));
console.log('corridor ' + c.id + ': ' + doorState + ' door, number «' + out.text + '», ' + out.meshes.length + ' meshes → /tmp/door.json');
console.log(out.meshes.map(m => m.name).join(', '));
