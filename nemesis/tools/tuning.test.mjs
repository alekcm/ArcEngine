// tuning.test.mjs — the board tuning table and the door geometry derived from it.
//   node --test nemesis/tools/tuning.test.mjs
// The door was rebuilt three times in a row because its numbers lived in the renderer: every "make
// the beam wider" was a code change. They live in client/tuning.js now, the editor writes them and
// the game reads them — so the important thing to keep is that NO slider position can produce an
// impossible door: leaves that do not meet, a doorway blocked by an open leaf, or a stencil wider
// than the beam it is painted on.
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
    assert.ok(D.openW > 0.5, label + ': a doorway you can walk through (' + D.openW.toFixed(2) + ')');
    assert.ok(Math.abs(D.panelClosed - D.panelW / 2) < 1e-9, label + ': the closed leaves meet in the middle');
    assert.ok(Math.abs(D.panelClosed + D.panelW / 2 - D.openW / 2) < 1e-9, label + ': the closed leaves reach the posts');
    // an open leaf never blocks the doorway (it may poke out of a narrow post, but not into the opening)
    assert.ok(D.panelOpen - D.panelW / 2 >= D.openW / 2 - 1e-9, label + ': an open leaf clears the doorway');
    assert.ok(D.panelH > 0.5 && D.panelH <= D.postH - 0.3, label + ': the leaves fit under the beam');
    // the stencil fits on the beam it is painted on
    assert.ok(D.decalW > 0.5, label + ': a stencil big enough to read (' + D.decalW.toFixed(2) + ')');
    assert.ok(D.decalW <= D.beamW - 0.39, label + ': the stencil is narrower than the beam');
    assert.ok(D.decalH <= D.beamD - 0.2, label + ': the stencil is not deeper than the beam');
    assert.ok(Math.abs(D.decalW / D.decalH - 2) < 1e-9, label + ': the stencil keeps its 2:1 canvas');
    assert.ok(D.decalY > D.beamTop, label + ': the stencil lies on top of the beam, never inside it');
    assert.ok(D.slabW >= D.beamW, label + ': the slab is at least as wide as the beam');
    assert.ok(D.beamY - D.beamH / 2 >= D.postH - 1e-9, label + ': the beam caps the posts');
    assert.ok(D.lampY < D.postH && D.lampY > D.panelH, label + ': the emergency lamps sit above the leaves');
}

test('TU-01 the schema is complete and its defaults are inside their own ranges', () => {
    assert.ok(SCHEMA.length >= 1, 'at least one group');
    for (const g of SCHEMA) {
        assert.ok(g.id && g.title, 'a group needs an id and a title');
        for (const it of g.items) {
            const key = g.id + '.' + it.key;
            assert.ok(it.label, key + ': a human label for the editor');
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
    assert.equal(sanitize('door.postH', 999), 3.4, 'above the range: clamped');
    assert.equal(sanitize('door.postH', -5), 1.6, 'below the range: clamped');
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
    TUNE.set('door.beamW', 6.0);
    assert.deepEqual(Object.keys(TUNE.diff()), ['door.beamW'], 'only the changed value is saved');
    TUNE.reset();
});

test('TU-05 the stencil follows the beam', () => {
    TUNE.reset();
    const base = doorSpec();
    TUNE.set('door.beamD', 3.0);           // a deeper beam frees the stencil from the depth cap
    const deep = doorSpec();
    assert.ok(deep.decalW > base.decalW, 'a deeper beam carries a wider stencil');
    checkDoor(deep, 'deep beam');
    TUNE.set('door.beamW', base.beamW + 1.0);
    const bigger = doorSpec();
    assert.ok(bigger.decalW > deep.decalW, 'and a longer beam carries a longer one');
    checkDoor(bigger, 'deep and wide beam');
    TUNE.set('door.beamD', 0.6);   // now the depth is the limit
    const shallow = doorSpec();
    assert.ok(shallow.decalH <= shallow.beamD - 0.2, 'a shallow beam caps the stencil');
    checkDoor(shallow, 'shallow beam');
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
