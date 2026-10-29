// tuning.test.mjs — the board tuning table and the door geometry derived from it.
//   node --test nemesis/tools/tuning.test.mjs
// The door was rebuilt three times in a row because its numbers lived in the renderer: every "make
// the frame wider" was a code change. They live in client/tuning.js now, the editor writes them and
// the game reads them — so the important thing to keep is that NO slider position can produce an
// impossible door: a central closed panel that cannot fill the clear opening, a lintel that does
// not span its posts, a plate thinner than the gap it bridges, or a stencil wider than the plate it
// is painted on. The frame is two ordinary corridor arches with the plate between them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNE, SCHEMA, DEFAULTS, sanitize, sanitizeAll, doorSpec } from '../client/tuning.js';

/** Every numeric field, with its schema item. */
function numbers() {
    const out = [];
    for (const g of SCHEMA) for (const it of g.items) if (typeof it.v === 'number') out.push({ key: g.id + '.' + it.key, it });
    return out;
}

/** The invariants the renderer relies on. */
function checkDoor(D, label) {
    // one central closed panel derives from the exact clear opening; no hinged or side-leaf tuning
    assert.ok(D.openW > 0.5, label + ': a doorway you can walk through (' + D.openW.toFixed(2) + ')');
    assert.ok(Math.abs(D.openW - 2 * (D.postX - D.postW / 2)) < 1e-9,
        label + ': a closed panel spans exactly the space between the posts');
    for (const gone of ['pivotX', 'panelW', 'panelH', 'panelSwing']) {
        assert.equal(D[gone], undefined, label + ': there is no side-leaf tuning (' + gone + ')');
    }
    // the arches and the plate between them
    assert.ok(D.archGap > D.postD, label + ': the arches stand apart');
    assert.ok(D.plateD >= 0.2, label + ': there is a plate between them (' + D.plateD.toFixed(2) + ')');
    assert.ok(D.plateD <= D.archGap - D.postD + 1e-9, label + ': the plate never grows past the arches');
    assert.ok(D.beamW >= D.postX * 2 + D.postW - 1e-9, label + ': the lintel spans both posts');
    assert.ok(D.beamY + D.beamH / 2 >= D.postH - 1e-9, label + ': the lintel caps the posts');
    // The stencil: sized from the plate's WIDTH only. A short doorway must not shrink the digits —
    // that is the whole point of printing them across the plate rather than inside it.
    assert.ok(D.decalW > 0.3, label + ': a stencil big enough to read (' + D.decalW.toFixed(2) + ')');
    assert.ok(D.decalW <= D.beamW - 0.4 + 1e-9, label + ': the stencil is narrower than the plate');
    assert.ok(Math.abs(D.decalW / D.decalH - 2) < 1e-9, label + ': the stencil keeps its 2:1 canvas');
    assert.ok(Math.abs(D.decalW - Math.max(0.4, Math.min(D.beamW * TUNE.get('door.numShare'), D.beamW - 0.4))) < 1e-9,
        label + ': the digits do not depend on the depth of the plate');
    assert.ok(D.decalY > D.beamTop, label + ': the stencil lies on top of the plate, never inside it');
    assert.ok(D.lampY > 0.6 && D.lampY < D.postH - 0.05, label + ': the emergency lamps hang on the posts');
}

test('TU-01 the schema is complete and its defaults are inside their own ranges', () => {
    assert.ok(SCHEMA.length >= 1, 'at least one group');
    for (const g of SCHEMA) {
        assert.ok(g.id && g.title && g.title.en && g.title.ru, 'a group needs an id and a title in both languages');
        for (const it of g.items) {
            const key = g.id + '.' + it.key;
            assert.ok(it.label && it.label.en && it.label.ru, key + ': a label in both languages (the editor is EN/RU)');
            if (typeof it.v === 'string') {
                assert.match(it.v, /^#[0-9a-f]{6}$/, key + ': a colour default');
            } else {
                assert.ok(Number.isFinite(it.min) && Number.isFinite(it.max) && it.min < it.max, key + ': a range');
                assert.ok(it.step > 0, key + ': a step');
                assert.ok(it.v >= it.min && it.v <= it.max, key + ': the default is inside the range');
            }
            assert.equal(DEFAULTS[key], it.v, key + ': the defaults table matches the schema');
        }
    }
});

test('TU-02 sanitize clamps numbers and throws away junk', () => {
    assert.equal(sanitize('door.postH', 999), 2.6, 'above the range: clamped');
    assert.equal(sanitize('door.postH', -5), 1.2, 'below the range: clamped');
    assert.equal(sanitize('door.postH', '2.2'), 2.2, 'numeric strings are accepted');
    assert.equal(sanitize('door.postH', 'толще'), undefined, 'words are not numbers');
    assert.equal(sanitize('door.postH', NaN), undefined, 'NaN is not a number');
    assert.equal(sanitize('door.nope', 1), undefined, 'an unknown key is rejected');
    assert.equal(sanitize('door.steel', '#AABBCC'), '#aabbcc', 'colours are normalised');
    assert.equal(sanitize('door.steel', 'red'), undefined, 'named colours are not hex');
    assert.equal(sanitize('door.steel', 12), undefined, 'a colour is not a number');
});

test('TU-03 sanitizeAll writes only what the schema knows', () => {
    const out = sanitizeAll({ 'door.postX': 2, 'door.steel': '#112233', 'evil.key': 1, 'door.postH': 'x' });
    assert.deepEqual(out, { 'door.postX': 2, 'door.steel': '#112233' });
    assert.deepEqual(sanitizeAll(null), {}, 'no file: nothing to load');
    assert.deepEqual(sanitizeAll('nonsense'), {}, 'garbage is ignored');
});

test('TU-04 the default door is buildable, and TUNE.diff tracks changes', () => {
    TUNE.reset();
    checkDoor(doorSpec(), 'defaults');
    assert.deepEqual(TUNE.diff(), {}, 'nothing differs until something is changed');
    TUNE.set('door.beamW', 3.2);
    assert.deepEqual(Object.keys(TUNE.diff()), ['door.beamW'], 'only the changed value is saved');
    TUNE.reset();
});

test('TU-05 shortening the doorway never shrinks the number', () => {
    TUNE.reset();
    const base = doorSpec();
    TUNE.set('door.archGap', 3.6);            // the arches move apart: a deeper plate under the digits
    const deep = doorSpec();
    assert.ok(deep.plateD > base.plateD, 'a wider gap makes a deeper plate (' + deep.plateD.toFixed(2) + ')');
    assert.equal(deep.decalW, base.decalW, 'the digits keep their printed width');
    assert.equal(deep.decalH, base.decalH, 'and their printed height');
    checkDoor(deep, 'deep plate');
    TUNE.set('door.archGap', 0.6);            // the shortest the slider allows
    const short = doorSpec();
    assert.ok(short.plateD < base.plateD, 'a shorter doorway makes a shallower plate (' + short.plateD.toFixed(2) + ')');
    assert.equal(short.decalW, base.decalW, 'the number is exactly as wide as on the long door');
    assert.equal(short.decalH, base.decalH, 'and exactly as deep — it is not scaled down');
    checkDoor(short, 'short plate');
    // the width is what the number follows: a wider plate may carry a wider stencil
    TUNE.reset();
    TUNE.set('door.beamW', 4.0); TUNE.set('door.numShare', 1.0);
    assert.ok(doorSpec().decalW > base.decalW, 'a wider plate lets the number grow');
    TUNE.reset();
});

test('TU-06 no slider position can break the door', () => {
    const fields = numbers();
    for (const { key, it } of fields) {
        for (const v of [it.min, it.max]) {
            TUNE.reset();
            TUNE.set(key, v);
            checkDoor(doorSpec(), key + ' = ' + v);
        }
    }
    // and all of them at once, at both ends of their ranges
    TUNE.reset();
    for (const { key, it } of fields) TUNE.set(key, it.min);
    checkDoor(doorSpec(), 'everything at min');
    TUNE.reset();
    for (const { key, it } of fields) TUNE.set(key, it.max);
    checkDoor(doorSpec(), 'everything at max');
    TUNE.reset();
});
