import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  ROOT, LABELS, decodePNG, encodePNG, crop, feature, carrier,
  loadReferences, classify, validateReferences
} from '../tools/combat-icons.mjs';

const refDir = path.join(ROOT, 'docs/forbidden-stars/combat-icons');
const references = loadReferences();

function solid(width, height, value) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
  }
  return { width, height, data };
}

test('PNG encode/decode round-trips RGBA pixels', () => {
  const image = solid(3, 2, 10);
  image.data[3] = 128;
  image.data[4] = 200;
  const decoded = decodePNG(encodePNG(image));
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.data, image.data);
});

test('crop rejects out-of-bounds and non-integer boxes', () => {
  const image = solid(4, 4, 0);
  assert.equal(crop(image, [1, 1, 2, 2]).width, 2);
  assert.throws(() => crop(image, [3, 3, 2, 2]), /outside image/);
  assert.throws(() => crop(image, [0, 0, 1.5, 2]), /outside image/);
});

test('blank and low-contrast crops are rejected, not guessed', () => {
  const blank = solid(32, 32, 200);
  assert.equal(feature(blank), null);
  const result = classify(blank, 'text', references);
  assert.equal(result.label, '?');
  assert.equal(result.reason, 'low-contrast');
});

test('references come only from the five trusted factions and cover every label', () => {
  const trusted = new Set(['imperial-guard', 'necrons', 'tyranids', 'eldar', 'chaos']);
  assert.ok(references.length >= 30);
  for (const ref of references) {
    assert.ok(trusted.has(ref.faction), ref.id);
    assert.ok(LABELS.includes(ref.label), ref.id);
    assert.ok(ref.sourceSha256.match(/^[0-9a-f]{64}$/), ref.id);
  }
  for (const label of LABELS) assert.ok(references.some(r => r.label === label), label);
  for (const faction of ['orks', 'tau', 'space-marines', 'mechanicus', 'inquisition', 'dark-eldar', 'sisters-of-battle']) {
    assert.ok(!references.some(r => r.faction === faction), faction);
  }
});

test('carrier geometry distinguishes disk, square face and empty cube', () => {
  const byLabel = label => references.find(r => r.label === label);
  const token = byLabel('att. token');
  const cube = byLabel('morale cube');
  const any = byLabel('any cube');
  const read = ref => decodePNG(fs.readFileSync(path.join(refDir, ref.file)));
  assert.equal(carrier(read(token), 'text').kind, 'token');
  assert.equal(carrier(read(cube), 'text').kind, 'cube');
  assert.equal(carrier(read(any), 'text').kind, 'any-cube');
});

test('held-out-faction validation has no wrong labels or abstentions on the reference set', () => {
  const results = validateReferences(references);
  assert.equal(results.length, references.length);
  for (const row of results) {
    assert.equal(row.predicted, row.expected, `${row.id}: ${JSON.stringify(row)}`);
  }
});

test('Ork audit manifest covers 14 cards and 58 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'orks.json'), 'utf8'));
  assert.equal(manifest.faction, 'orks');
  assert.equal(manifest.cards.length, 14);
  assert.equal(new Set(manifest.cards.map(c => c.card)).size, 14);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 4);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 58);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    for (const icon of card.icons) assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
});

test('Tau audit manifest covers all 27 prints, 14 names and 119 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'tau.json'), 'utf8'));
  assert.equal(manifest.faction, 'tau');
  assert.equal(manifest.cards.length, 27);
  assert.equal(new Set(manifest.cards.map(c => c.card)).size, 14);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 119);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  // The two Greater Good prints must remain separate: their unit abilities differ in print.
  const greater = manifest.cards.filter(c => c.card === 'greater-good');
  assert.equal(greater.length, 2);
});

test('Tau order-upgrade manifest is separate from combat cards and covers three empty cubes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'tau-orders.json'), 'utf8'));
  assert.equal(manifest.faction, 'tau');
  assert.equal(manifest.cards.length, 2);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 3);
  for (const icon of icons) {
    assert.equal(icon.expected, 'any cube');
    assert.equal(icon.location, 'text');
    assert.ok(icon.box.every(Number.isInteger));
  }
  for (const card of manifest.cards) {
    assert.equal(card.source, 'Warhammer/Тау/Карти наказів (3).jpg');
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  assert.ok(!references.some(r => r.faction === 'tau'));
});

test('Space Marine audit manifest covers 14 distinct cards on two sheets and 68 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'space-marines.json'), 'utf8'));
  assert.equal(manifest.faction, 'space-marines');
  assert.equal(manifest.cards.length, 14);
  assert.equal(new Set(manifest.cards.map(c => c.card)).size, 14);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 2);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 68);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  // The two sheets complement each other; neither is a reference source.
  assert.ok(!references.some(r => r.faction === 'space-marines'));
});

test('Mechanicus audit manifest covers 28 prints on two sheets and 156 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'mechanicus.json'), 'utf8'));
  assert.equal(manifest.faction, 'mechanicus');
  assert.equal(manifest.cards.length, 28);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 2);
  assert.equal(manifest.cards.filter(c => c.id.startsWith('ded-')).length, 14);
  assert.equal(manifest.cards.filter(c => c.id.startsWith('alt-')).length, 14);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 156);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  // Neither printed version is a reference source.
  assert.ok(!references.some(r => r.faction === 'mechanicus'));
});

test('Inquisition audit manifest covers 14 cards on one composite sheet and 73 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'inquisition.json'), 'utf8'));
  assert.equal(manifest.faction, 'inquisition');
  assert.equal(manifest.cards.length, 14);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 1);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 73);
  assert.equal(icons.filter(i => i.location === 'column').length, 32);
  assert.equal(icons.filter(i => i.location === 'text').length, 41);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  assert.ok(!references.some(r => r.faction === 'inquisition'));
});

test('Dark Eldar audit manifest covers 14 cards on one composite sheet and 76 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'dark-eldar.json'), 'utf8'));
  assert.equal(manifest.faction, 'dark-eldar');
  assert.equal(manifest.cards.length, 14);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 1);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 76);
  assert.equal(icons.filter(i => i.location === 'column').length, 29);
  assert.equal(icons.filter(i => i.location === 'text').length, 47);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  assert.ok(!references.some(r => r.faction === 'dark-eldar'));
});

test('Sisters of Battle audit manifest covers 15 cards on two sheets and 73 manually located symbols', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'sisters-of-battle.json'), 'utf8'));
  assert.equal(manifest.faction, 'sisters-of-battle');
  assert.equal(manifest.cards.length, 15);
  assert.equal(new Set(manifest.cards.map(c => c.source)).size, 2);
  const icons = manifest.cards.flatMap(c => c.icons);
  assert.equal(icons.length, 73);
  assert.equal(icons.filter(i => i.location === 'column').length, 27);
  assert.equal(icons.filter(i => i.location === 'text').length, 46);
  for (const icon of icons) {
    assert.ok(LABELS.includes(icon.expected));
    assert.equal(icon.box.length, 4);
    assert.ok(icon.box.every(Number.isInteger));
  }
  const ids = new Set();
  for (const card of manifest.cards) {
    assert.ok(!ids.has(card.id));
    ids.add(card.id);
    assert.ok(fs.existsSync(path.resolve(refDir, card.image)));
  }
  assert.ok(!references.some(r => r.faction === 'sisters-of-battle'));
});

test('empty-cube carrier keeps enclosed faces distinct from a token glyph hole', () => {
  const read = ref => decodePNG(fs.readFileSync(path.join(refDir, ref.file)));
  for (const ref of references.filter(r => r.label === 'any cube')) {
    const shape = carrier(read(ref), 'text');
    assert.ok(shape.kind === 'any-cube' || shape.kind === 'uncertain', ref.id);
    if (shape.kind === 'any-cube') assert.ok(shape.holes >= 2 || shape.ink < .30, ref.id);
  }
});

test('audit CLI reports mismatch without changing the classifier prediction', () => {
  const ref = references.find(r => r.label === 'att. token');
  const image = decodePNG(fs.readFileSync(path.join(refDir, ref.file)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-icons-'));
  try {
    const manifest = {
      cards: [{ id: 'sample', image: ref.file, icons: [{
        id: 'one', box: [0, 0, image.width, image.height], location: 'text', expected: 'def. cube'
      }] }]
    };
    // The manifest lives beside the reference image so the relative path resolves.
    const manifestPath = path.join(refDir, '__test-audit-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      const result = spawnSync(process.execPath, [
        path.join(ROOT, 'tools/combat-icons.mjs'), 'audit',
        '--manifest', manifestPath, '--out', tmp
      ], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      const report = JSON.parse(fs.readFileSync(path.join(tmp, 'report.json'), 'utf8'));
      assert.equal(report.results[0].label, 'att. token');
      assert.equal(report.results[0].expected, 'def. cube');
      assert.equal(report.results[0].matches, false);
    } finally {
      fs.rmSync(manifestPath, { force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
