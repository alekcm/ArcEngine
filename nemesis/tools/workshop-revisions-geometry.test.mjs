// Isolated geometry regressions for the revised workshops.
// NullEngine retains large internal caches even after disposal; isolating these many combinations
// keeps the complete test suite within Node's normal heap limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => null, addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, width: 800, height: 600,
    clientWidth: 800, clientHeight: 600, nodeName: 'CANVAS',
});
const doc = {
    createElement: el, createElementNS: el, documentElement: el(), body: el(), addEventListener: noop, removeEventListener: noop,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: el(),
    fonts: { add: noop, ready: Promise.resolve() }, pointerLockElement: null,
};
const sandbox = {
    document: doc, navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0, language: 'ru' },
    location: { href: 'http://localhost/', protocol: 'http:' }, performance: { now: () => Date.now() },
    requestAnimationFrame: cb => setTimeout(cb, 16), cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    localStorage: { getItem: () => null, setItem: noop }, setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, ArrayBuffer, Uint8Array, Blob: class {}, HTMLElement: class {}, Image: class {}, WebGLRenderingContext: class {},
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.runInContext(fs.readFileSync(new URL('../../libs/babylon.js', import.meta.url), 'utf8'), vm.createContext(sandbox), { filename: 'babylon.js' });
globalThis.window = sandbox;
globalThis.localStorage = sandbox.localStorage;
try { Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true }); } catch { globalThis.document = doc; }
const B = sandbox.BABYLON;

const engine = new B.NullEngine(), scene = { scene: new B.Scene(engine) };

const { buildCharacter, characterColors, DEFAULTS } = await import('../client/characters.js');
const S = scene.scene;
const ancestor = (m, name) => { for (let n = m?.parent; n; n = n.parent) if (n.name === name) return true; return false; };
const meshesOf = ch => ch.root.getChildMeshes();
const refresh = ch => { for (const m of meshesOf(ch)) m.computeWorldMatrix(true); };
const named = (meshes, n) => meshes.find(m => m.name === n);
const slotOf = (meshes, slot) => meshes.filter(m => m.metadata?.appearancePart?.slot === slot);

// These hashes were captured from the previous commit before the requested redesign.
const signature = meshes => {
    const round = n => Math.abs(n) < 0.000005 ? 0 : Number(n.toFixed(5));
    return meshes.map(m => {
        m.computeWorldMatrix(true);
        return JSON.stringify([(m.getVerticesData(B.VertexBuffer.PositionKind) || []).map(round), Array.from(m.getWorldMatrix().m, round)]);
    }).sort();
};
const hash = meshes => createHash('sha256').update(JSON.stringify(signature(meshes))).digest('hex');

test('REV-01: the Sentry optics and the two other Survivor hairstyles are byte-for-byte unchanged', () => {
    const opticsHashes = {
        classic: '73c3539cc5bab28b5c5da2d3ad36d4a6e9c39c1666e1c04e83baffee31e92c62',
        binocular: 'c8aa56f1087e31d0dbd8ec6b7c3e8f9acdd0735bb45ac4df83d8051ea10389e5',
        cluster: '1ab3e0d221538de3501d44b04ebc72444084cd357bd481067911117168388dc4',
    };
    for (const [optics, expected] of Object.entries(opticsHashes)) {
        const ch = buildCharacter(S, 'sentry', {}, { optics, suit: 'breacher', shoulders: 'segmented', cloak: 'split', respirator: 'ribbed' });
        assert.equal(hash(meshesOf(ch).filter(m => m.parent === ch.root && m.position.y > 2.8)), expected, `${optics}: complete original optics including housing`);
        ch.root.dispose();
    }
    for (const [hair, expected] of Object.entries({
        wavy: 'd51ec4fe04e3a8e06ff1d051ead7372b3e0a0d9bca6d468bc1a0d217c3f816c6',
        long: '67d382e39b0b0da52125723b7c03892824ff95da26c10c4045f7e8920177735f',
    })) {
        const ch = buildCharacter(S, 'survivor', {}, { hair });
        assert.equal(hash(slotOf(meshesOf(ch), 'hair')), expected, `${hair}: untouched hairstyle`);
        ch.root.dispose();
    }
});

test('REV-02: all 324 patient and 243 Sentry combinations build, paint and animate', () => {
    const worker = fileURLToPath(new URL('./crew-combinations.worker.mjs', import.meta.url));
    for (const [id, count] of [['labrat', 324], ['sentry', 243]]) {
        const result = spawnSync(process.execPath, [worker, id], { encoding: 'utf8', timeout: 60000 });
        assert.equal(result.status, 0, `${id}: ${result.stderr || result.stdout || result.error}`);
        assert.match(result.stdout, new RegExp(`RESULT ${count}\\b`), `${id}: every combination checked`);
    }
});

test('REV-03: Sentry replacements are whole, the cloak is joined and the shotgun stays in both hands', () => {
    for (const slot of ['suit', 'respirator', 'shoulders', 'cloak']) {
        const ids = { suit: ['classic', 'patrol', 'breacher'], respirator: ['classic', 'reinforced', 'ribbed'],
            shoulders: ['classic', 'segmented', 'heavy'], cloak: ['classic', 'split', 'torn'] }[slot];
        const samples = ids.map(id => {
            const ch = buildCharacter(S, 'sentry', {}, { [slot]: id });
            const meshes = slotOf(meshesOf(ch), slot), result = signature(meshes);
            assert.ok(meshes.length >= 3 && meshes.every(m => m.metadata.appearancePart.variant === id), `${slot}/${id}: full replacement`);
            ch.root.dispose(); return result;
        });
        for (const other of samples.slice(1)) {
            const shapes = new Set(other);
            assert.ok(samples[0].filter(s => !shapes.has(s)).length >= 2, `${slot}: original pieces are actually removed`);
        }
    }
    for (const suit of ['classic', 'patrol', 'breacher']) for (const cloak of ['classic', 'split', 'torn']) {
        const ch = buildCharacter(S, 'sentry', {}, { suit, cloak, shoulders: 'segmented' }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), cloth = slotOf(meshes, 'cloak').filter(m => ch.zones.cloak.includes(m));
        const back = cloth.find(m => m.metadata?.sentryCloakBack), collar = cloth.find(m => m.metadata?.sentryCloakJoin);
        const pads = meshes.filter(m => m.metadata?.sentryShoulder), gun = ch.root.getDescendants().find(n => n.name === 'gun');
        const hands = ['L', 'R'].map(side => meshes.find(m => m.metadata?.sentryHand === side));
        assert.ok(back && collar && gun && hands.every(Boolean));
        assert.ok(pads.every(m => ancestor(m, m.metadata.sentryShoulder === 'L' ? 'armL' : 'armR')));
        refresh(ch);
        for (const m of slotOf(meshes, 'suit').filter(m => m.getAbsolutePosition().y < 1.24))
            assert.ok(ancestor(m, 'legL') || ancestor(m, 'legR'), `${suit}: shin, knee and side armour follow a leg`);
        // Traverse touching cloth panels, including the rear join under the backpack.
        const connected = new Set([back]);
        for (let changed = true; changed;) {
            changed = false;
            for (const a of connected) for (const b of cloth) if (!connected.has(b) && a.intersectsMesh(b, true)) { connected.add(b); changed = true; }
        }
        assert.ok(connected.has(collar), `${cloak}: cape does not float below the collar`);
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(hands.every(hand => gun.getChildMeshes().some(m => m.intersectsMesh(hand, true))), `${suit}: both hands grip the shotgun at ${t}`);
        }
        const before = gun.position.z; ch.shoot(); ch.animate(0.45, true); refresh(ch);
        assert.ok(gun.position.z < before && hands.every(hand => gun.getChildMeshes().some(m => m.intersectsMesh(hand, true))), `${suit}: grip holds through recoil`);
        ch.root.dispose();
    }
});

test('REV-04: the patient retains a cloth blindfold, bare hands and feet, ID and connected wrists', () => {
    for (const hair of ['loose', 'messy', 'ponytail']) for (const outfit of ['gown', 'torn', 'long'])
        for (const wrists of ['classic', 'bandaged', 'restraints']) {
            const ch = buildCharacter(S, 'labrat', {}, { hair, outfit, wrists, eyes: 'layered' }); ch.root.scaling.setAll(1);
            const meshes = meshesOf(ch), blindfold = meshes.find(m => m.metadata?.labBlindfold), ink = slotOf(meshes, 'wrists');
            const torso = meshes.find(m => m.metadata?.labTorso), neck = ch.zones.skin.find(m => Math.abs(m.position.y - 2.2) < 0.001);
            assert.ok(blindfold && ch.zones.bandage.includes(blindfold) && torso && neck, 'hospital clothing and cloth blindfold');
            assert.ok(ch.zones.skin.some(m => m.parent?.name === 'legL' && m.position.y < -1.2), 'bare feet');
            if (wrists === 'classic') assert.equal(ink.length, 0, 'original has no added restraints');
            else assert.ok(ink.length >= 6 && ink.every(m => ancestor(m, 'armL') || ancestor(m, 'armR')), `${wrists}: both restraints follow the hands`);
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); refresh(ch);
                assert.ok(neck.intersectsMesh(torso, true), 'patient head is joined to gown');
                assert.ok(ink.every(m => ancestor(m, 'armL') || ancestor(m, 'armR')), 'wrists remain attached');
            }
            blindfold.isPickable = true; ch.animate(0.4, false); ch.root.position.y = 0; refresh(ch);
            for (const x of [-0.08, 0, 0.08]) for (const y of [2.44, 2.48, 2.52]) {
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(x, y, 1), new B.Vector3(0, 0, -1), 2), m => m === blindfold);
                assert.ok(hit.hit, 'cloth covers both eyes');
            }
            assert.ok(meshes.some(m => m.material?.diffuseColor?.toHexString() === '#F4F6F8' && Math.abs(m.position.x - 0.1) < 0.001), 'patient ID tag');
            ch.root.dispose();
        }
});

test('REV-05: Android trousers replace waist, legs and footwear and stay joined while walking', () => {
    for (const trousers of ['tailored', 'utility']) {
        const ch = buildCharacter(S, 'android', {}, { trousers }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), part = name => meshes.filter(m => m.metadata?.androidTrouser === name);
        const waist = part('waist')[0]; assert.ok(waist && part('sole').length === 2 && part('shin').length === 2);
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); refresh(ch);
            for (const side of ['L', 'R']) {
                const p = name => part(name).find(m => ancestor(m, 'leg' + side));
                assert.ok(p('sole').intersectsMesh(p('shoe'), true) && p('shoe').intersectsMesh(p('boot'), true), `${trousers}: ${side} shoe`);
                assert.ok(p('boot').intersectsMesh(p('shin'), true) && p('shin').intersectsMesh(p('thigh'), true), `${trousers}: ${side} leg`);
                assert.ok(p('thigh').intersectsMesh(waist, true), `${trousers}: ${side} leg meets waist`);
            }
        }
        ch.setColors({ pants: '#aa6633' }); assert.ok(ch.zones.pants.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#aa6633'));
        ch.root.dispose();
    }
});

test('REV-06: Convict tattoos remain on skin and shoulder implants cover the shoulder tops', () => {
    for (const plates of ['classic', 'shoulder', 'asymmetric']) for (const tattoos of ['classic', 'tribal', 'prison']) {
        const ch = buildCharacter(S, 'convict', {}, { plates, tattoos }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), parts = slotOf(meshes, 'plates'), skin = ch.zones.skin;
        const arms = ['L', 'R'].map(side => meshes.find(m => m.metadata?.convictArm === 'hand' + side));
        assert.ok(arms.every(m => skin.includes(m)), 'tattoos never replace the hands');
        const ink = slotOf(meshes, 'tattoos');
        assert.ok(ink.length >= 6 && ink.every(m => ch.zones.tattoo.includes(m)), 'independently paintable tattoo set');
        for (const m of [...parts, ...skin]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            for (const side of plates === 'asymmetric' ? [-1] : [-1, 1]) for (const x of [0.27, 0.35, 0.43]) for (const z of [-0.14, 0, 0.14]) {
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(side * x, 3 + ch.root.position.y, z), new B.Vector3(0, -1, 0), 2), m => parts.includes(m) || skin.includes(m));
                assert.ok(parts.includes(hit.pickedMesh), `${plates}/${tattoos}: shoulder implant covers skin at ${side * x}, ${z}, t=${t}`);
            }
        }
        ch.setColors({ tattoo: '#355b9a' }); assert.ok(ch.zones.tattoo.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#355b9a'));
        ch.root.dispose();
    }
});

test('REV-07: Captain epaulettes and inset shoulder display are different mounted and paintable models', () => {
    const shapes = [];
    for (const shoulders of ['classic', 'layered', 'heavy']) {
        const ch = buildCharacter(S, 'captain', {}, { shoulders });
        const meshes = slotOf(meshesOf(ch), 'shoulders'); shapes.push(signature(meshes));
        if (shoulders !== 'classic') assert.ok(meshes.every(m => ancestor(m, 'armL') || ancestor(m, 'armR')), `${shoulders}: attached to moving shoulders`);
        const screen = meshes.find(m => m.metadata?.captainScreen);
        assert.equal(!!screen, shoulders === 'heavy');
        if (screen) {
            const bezel = meshes.find(m => m.metadata?.captainScreenBezel), pad = screen.parent;
            assert.ok(bezel && bezel.parent === pad && pad.metadata?.captainShoulder === 'L', 'display and bezel are built into the left pad');
            const b = screen.getBoundingInfo().boundingBox, padFace = pad.getBoundingInfo().boundingBox.maximum.z;
            assert.ok(b.extendSize.x > b.extendSize.y && b.extendSize.y > b.extendSize.z, 'the display is a thin rectangle');
            assert.ok(screen.position.z + b.maximum.z - padFace < 0.035, 'display is almost flush with the armour, not a projecting tube');
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); refresh(ch);
                assert.ok(screen.intersectsMesh(bezel, true) && bezel.intersectsMesh(pad, true), 'display remains connected to its bezel and shoulder');
            }
            ch.setColors({ lights: '#12db83' });
            assert.equal(screen.material.diffuseColor.toHexString().toLowerCase(), '#12db83');
        }
        ch.root.dispose();
    }
    assert.equal(new Set(shapes.map(s => JSON.stringify(s))).size, 3);
});

test('REV-08: the original sample is visible beyond the hand, sleeves cover cuffs and shirt fits inside trousers', () => {
    for (const jacket of ['classic', 'collar', 'pockets']) for (const trousers of ['classic', 'utility', 'field']) {
        const ch = buildCharacter(S, 'xeno', {}, { jacket, trousers, tool: 'classic' }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), sample = meshes.find(m => m.metadata?.xenoSample), grip = meshes.find(m => m.metadata?.xenoToolGrip);
        const hand = named(meshes, 'xeno_hand_R'), forearm = named(meshes, 'xeno_forearm_R');
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(grip.intersectsMesh(hand, true), `${jacket}: sample is held`);
            assert.ok(!sample.intersectsMesh(hand, true) && !sample.intersectsMesh(forearm, true), `${jacket}: sample is not buried in the hand`);
        }
        if (jacket !== 'classic') {
            const shirt = meshes.find(m => m.metadata?.xenoShirt);
            assert.ok(shirt.getBoundingInfo().boundingBox.minimumWorld.y - ch.root.position.y >= 1.52, 'shirt hem ends above the waistband');
        }
        if (jacket === 'collar') for (const side of ['L', 'R']) {
            const upper = meshes.find(m => m.metadata?.xenoUpper === side), cuff = meshes.find(m => m.metadata?.xenoSleeveCuff === side);
            assert.ok(cuff && cuff.getBoundingInfo().boundingBox.extendSize.x > upper.getBoundingInfo().boundingBox.extendSize.x, 'collared sleeve opening is wider than the upper sleeve');
        }
        ch.root.dispose();
    }
});

test('REV-09: all Survivor bandana ends are roughly half-sized and clear of radios', () => {
    for (const bandana of ['classic', 'folded', 'tails']) for (const radio of ['classic', 'dual', 'caged']) {
        const ch = buildCharacter(S, 'survivor', {}, { bandana, radio }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), ties = meshes.filter(m => m.metadata?.survivorBandanaTie), pack = slotOf(meshes, 'radio');
        assert.equal(ties.length, bandana === 'classic' ? 1 : 2);
        for (const tie of ties) {
            const bb = tie.getBoundingInfo().boundingBox;
            assert.ok(bb.maximum.y - bb.minimum.y <= (bandana === 'tails' ? 0.201 : 0.101), `${bandana}: shortened ends`);
        }
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            for (const tie of ties) for (const m of pack) assert.ok(!tie.intersectsMesh(m, true), `${bandana}/${radio}: tie clears radio`);
        }
        ch.root.dispose();
    }
});

test('FIX-01: each patient sleeve covers the shoulder and both ankle options stay connected during a stride', () => {
    for (const outfit of ['gown', 'torn', 'long']) for (const ankle of ['classic', 'tracker', 'tag']) {
        const ch = buildCharacter(S, 'labrat', {}, { outfit, ankle, wrists: 'bandaged' }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), pieces = slotOf(meshes, 'ankle');
        const sleeves = ['L', 'R'].map(side => meshes.find(m => m.metadata?.labSleeve === side));
        const uppers = ['L', 'R'].map(side => ch.zones.skin.find(m => m.parent?.name === 'arm' + side && Math.abs(m.position.y + 0.21) < 0.001));
        assert.ok(sleeves.every(Boolean) && uppers.every(Boolean), `${outfit}: both sleeves and upper arms exist`);
        for (let i = 0; i < 2; i++) {
            const sleeve = sleeves[i], upper = uppers[i];
            const a = sleeve.getBoundingInfo().boundingBox.extendSize, b = upper.getBoundingInfo().boundingBox.extendSize;
            assert.equal(sleeve.parent, upper.parent, `${outfit}: sleeve follows the shoulder`);
            assert.ok(Math.abs(sleeve.position.x - upper.position.x) + b.x < a.x, `${outfit}: sleeve covers the arm's full width`);
            assert.ok(Math.abs(sleeve.position.z - upper.position.z) + b.z < a.z, `${outfit}: sleeve covers front and back of the shoulder`);
            const armTop = upper.position.y + b.y;
            assert.ok(armTop > sleeve.position.y - a.y && armTop < sleeve.position.y + a.y, `${outfit}: sleeve covers the top of the arm`);
        }
        let ankleSkin, ankleDetail;
        if (ankle === 'classic') assert.equal(pieces.length, 0, 'the original has no leg accessory');
        else {
            const side = ankle === 'tracker' ? 'L' : 'R';
            const band = pieces.find(m => m.metadata?.labAnkleBand);
            const skin = ch.zones.skin.find(m => m.parent?.name === 'leg' + side && Math.abs(m.position.y + 1.04) < 0.001);
            const detail = pieces.find(m => ankle === 'tracker' ? m.metadata?.labTrackerDisplay : m.metadata?.labAnkleTag);
            assert.ok(band && skin && detail && pieces.length >= 4, `${ankle}: complete ankle accessory`);
            ankleSkin = skin; ankleDetail = detail;
            assert.ok(pieces.every(m => ancestor(m, 'leg' + side)), `${ankle}: every piece follows the same leg`);
            refresh(ch);
            assert.ok(band.intersectsMesh(skin, true), `${ankle}: band wraps the ankle`);
            // Each visible part is physically joined to the strap, not floating nearby.
            const connected = new Set([band]);
            for (let changed = true; changed;) {
                changed = false;
                for (const a of connected) for (const b of pieces) if (!connected.has(b) && a.intersectsMesh(b, true)) { connected.add(b); changed = true; }
            }
            assert.equal(connected.size, pieces.length, `${ankle}: all pieces are connected`);
            for (const m of [skin, ...pieces]) m.isPickable = true;
            const outward = ankle === 'tracker' ? -1 : 1;
            const skinBox = skin.getBoundingInfo().boundingBox, detailBox = detail.getBoundingInfo().boundingBox;
            assert.ok(outward < 0 ? detailBox.maximumWorld.x < skinBox.minimumWorld.x : detailBox.minimumWorld.x > skinBox.maximumWorld.x,
                `${ankle}: the display or tag sits on the outside of the leg`);
            assert.ok(detailBox.extendSize.z > detailBox.extendSize.x * 2, `${ankle}: the broad face points sideways, not forward`);
            const y = ankle === 'tracker' ? 0.315 : 0.19;
            const hit = S.pickWithRay(new B.Ray(new B.Vector3(outward, y, 0), new B.Vector3(-outward, 0, 0), 2), m => m === skin || pieces.includes(m));
            assert.equal(hit?.pickedMesh, detail, `${ankle}: the display or tag is visible from the outside`);
        }
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(sleeves.every((s, i) => s.intersectsMesh(uppers[i], true)), `${outfit}: sleeves stay attached at ${t}`);
            if (pieces.length) {
                assert.ok(pieces.every(m => ancestor(m, ankle === 'tracker' ? 'legL' : 'legR')), `${ankle}: stays on the leg at ${t}`);
                const outward = ankle === 'tracker' ? -1 : 1, p = ankleDetail.getAbsolutePosition();
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(outward, p.y, p.z), new B.Vector3(-outward, 0, 0), 2), m => m === ankleSkin || pieces.includes(m));
                assert.equal(hit?.pickedMesh, ankleDetail, `${ankle}: its side remains visible at ${t}`);
            }
        }
        if (ankle === 'tracker') {
            ch.setColors({ lights: '#32baf1' });
            assert.equal(pieces.find(m => m.metadata?.labTrackerDisplay).material.diffuseColor.toHexString().toLowerCase(), '#32baf1');
        }
        ch.root.dispose();
    }
});

test('FIX-02: every Sentry pack stays outside every connected cloak, including while walking', () => {
    for (const suit of ['classic', 'patrol', 'breacher']) for (const cloak of ['classic', 'split', 'torn']) {
        const ch = buildCharacter(S, 'sentry', {}, { suit, cloak }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), pack = meshes.find(m => m.metadata?.sentryBackpack);
        const cloth = slotOf(meshes, 'cloak').filter(m => ch.zones.cloak.includes(m));
        const back = cloth.find(m => m.metadata?.sentryCloakBack);
        assert.ok(pack && back && back.position.z > pack.position.z, `${suit}/${cloak}: cape lies against the back`);
        for (const m of [pack, ...cloth]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            for (const x of [-0.1, 0, 0.1]) for (const y of [1.75, 1.9, 2.05]) {
                const ray = new B.Ray(new B.Vector3(x, y + ch.root.position.y, -2), new B.Vector3(0, 0, 1), 3);
                const hit = S.pickWithRay(ray, m => m === pack || cloth.includes(m));
                assert.equal(hit?.pickedMesh, pack, `${suit}/${cloak}: pack remains outside cape at ${x},${y},${t}`);
            }
        }
        ch.root.dispose();
    }
});

test('FIX-03: the classic Convict muzzle remains outside the face on the front and both cheeks', () => {
    for (const plates of ['classic', 'shoulder', 'asymmetric']) for (const tattoos of ['classic', 'tribal', 'prison']) {
        const ch = buildCharacter(S, 'convict', {}, { muzzle: 'classic', plates, tattoos }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), head = named(meshes, 'convict_head'), front = meshes.find(m => m.metadata?.convictMuzzleFront);
        const muzzle = slotOf(meshes, 'muzzle'), cheeks = ['L', 'R'].map(side => meshes.find(m => m.metadata?.convictMuzzleCheek === side));
        assert.ok(head && front && cheeks.every(Boolean));
        for (const m of [head, ...muzzle]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            const headBounds = head.getBoundingInfo().boundingBox, frontBounds = front.getBoundingInfo().boundingBox;
            assert.ok(frontBounds.maximumWorld.z > headBounds.maximumWorld.z + 0.06, 'front cage projects beyond the face');
            for (const s of [-1, 1]) for (const z of [0.08, 0.14]) {
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(s, 2.34 + ch.root.position.y, z), new B.Vector3(-s, 0, 0), 2), m => m === head || cheeks.includes(m));
                assert.equal(hit?.pickedMesh, cheeks[s < 0 ? 0 : 1], `${plates}: cheek plate covers the side of the head`);
            }
            for (const x of [-0.1, 0, 0.1]) for (const y of [2.3, 2.36]) {
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(x, y + ch.root.position.y, 1), new B.Vector3(0, 0, -1), 2), m => m === head || muzzle.includes(m));
                assert.ok(muzzle.includes(hit?.pickedMesh), `${plates}: muzzle is visible over the face`);
            }
        }
        ch.root.dispose();
    }
});

test('FIX-04: the third Survivor bandana is tied at the centre of the nape for every hair and radio', () => {
    for (const hair of ['classic', 'wavy', 'long']) for (const radio of ['classic', 'dual', 'caged']) {
        const ch = buildCharacter(S, 'survivor', {}, { hair, radio, bandana: 'tails' }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), knot = meshes.find(m => m.metadata?.survivorBandanaKnot);
        const ties = meshes.filter(m => m.metadata?.survivorBandanaTie), pack = slotOf(meshes, 'radio');
        assert.ok(knot && ties.length === 2);
        assert.ok(Math.abs(knot.position.x) < 1e-6, 'knot is on the centreline of the head');
        assert.ok(ties.every(m => Math.abs(m.position.x) <= 0.05) && Math.abs(ties[0].position.x + ties[1].position.x) < 1e-6,
            'both ends hang immediately to either side of the central knot');
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(ties.every(m => m.intersectsMesh(knot, true)), `${hair}/${radio}: both ends attach to the knot`);
            for (const tie of ties) {
                for (const m of pack) assert.ok(!tie.intersectsMesh(m, true), `${hair}/${radio}: ends clear the radio`);
                for (const h of ch.zones.hair) assert.ok(!tie.intersectsMesh(h, true), `${hair}/${radio}: ends stay visible behind hair`);
            }
        }
        ch.root.dispose();
    }
});

test('FIX-05: Xenobiologist lenses sit in front of the face and both frames extend past the sides', () => {
    for (const hair of ['classic', 'loosecurl', 'longtail']) for (const probe of ['classic', 'twin', 'shield']) {
        const ch = buildCharacter(S, 'xeno', {}, { hair, probe }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), head = named(meshes, 'xeno_head'), lenses = meshes.filter(m => m.metadata?.xenoGlasses);
        const frames = meshes.filter(m => m.metadata?.xenoFrame);
        assert.equal(lenses.length, 2); assert.ok(head && frames.length >= 9);
        for (const m of [head, ...lenses, ...frames]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            const face = head.getBoundingInfo().boundingBox;
            for (const lens of lenses) assert.ok(lens.getBoundingInfo().boundingBox.minimumWorld.z > face.maximumWorld.z + 0.02,
                `${hair}/${probe}: lens is just ahead of the face`);
            for (const side of [-1, 1]) {
                const label = side < 0 ? 'L' : 'R';
                const temple = frames.find(m => m.metadata.xenoFrame === label && Math.abs(m.position.z - 0.035) < 0.001);
                const b = temple?.getBoundingInfo().boundingBox;
                assert.ok(temple && (side < 0 ? b.minimumWorld.x < face.minimumWorld.x - 0.02 : b.maximumWorld.x > face.maximumWorld.x + 0.02),
                    `${hair}/${probe}: frame is wider than the head on ${label}`);
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(side, 2.48 + ch.root.position.y, 0.035), new B.Vector3(-side, 0, 0), 2), m => m === head || m === temple);
                assert.equal(hit?.pickedMesh, temple, `${hair}/${probe}: ${label} temple is visible from the side`);
            }
        }
        ch.root.dispose();
    }
});
