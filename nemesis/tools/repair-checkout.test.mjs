// repair-checkout.test.mjs — the launcher's safety net for a checkout that came out of a bad merge.
//   node --test nemesis/tools/repair-checkout.test.mjs
// The tool must (a) put back a file that still carries conflict markers, (b) leave every other local
// edit alone, and (c) revive a marker that was committed by mistake, taking the file from the remote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'repair-checkout.mjs');
const BROKEN = '<<<<<<< HEAD\nexport const a = 1;\n=======\nexport const a = 2;\n>>>>>>> other\n';
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });

function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'repair-'));
    git(dir, 'init', '-q', '.');
    mkdirSync(join(dir, 'tools'));
    copyFileSync(TOOL, join(dir, 'tools', 'repair-checkout.mjs'));
    return dir;
}
const run = dir => execFileSync(process.execPath, [join(dir, 'tools', 'repair-checkout.mjs')], { encoding: 'utf8' });

test('REPAIR-01 an uncommitted merge marker is replaced by the committed file', () => {
    const dir = repo();
    writeFileSync(join(dir, 'server.mjs'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'other.mjs'), 'export const b = 2;\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
    writeFileSync(join(dir, 'server.mjs'), BROKEN);
    writeFileSync(join(dir, 'other.mjs'), 'export const b = 3;\n');     // a genuine local edit
    const out = run(dir);
    assert.match(out, /восстановлен из HEAD/);
    assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), 'export const a = 1;\n');
    assert.equal(readFileSync(join(dir, 'other.mjs'), 'utf8'), 'export const b = 3;\n', 'other work is untouched');
});

test('REPAIR-02 a committed marker is taken from the remote branch', () => {
    const bare = mkdtempSync(join(tmpdir(), 'origin-'));
    git(bare, 'init', '-q', '--bare', '.');
    const dir = mkdtempSync(join(tmpdir(), 'work-'));
    git(dir, 'clone', '-q', bare, '.');
    mkdirSync(join(dir, 'tools'));
    copyFileSync(TOOL, join(dir, 'tools', 'repair-checkout.mjs'));
    writeFileSync(join(dir, 'server.mjs'), 'export const a = 1;\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
    git(dir, 'push', '-q', '-u', 'origin', 'HEAD');
    writeFileSync(join(dir, 'server.mjs'), BROKEN);
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'broken');
    const out = run(dir);
    assert.match(out, /восстановлен из origin\//);
    assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), 'export const a = 1;\n');
});

test('REPAIR-03 a clean checkout is left exactly as it is', () => {
    const dir = repo();
    writeFileSync(join(dir, 'server.mjs'), 'export const a = 1;\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
    const out = run(dir);
    assert.match(out, /чистая/);
    assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), 'export const a = 1;\n');
    // and the launcher really calls it before starting the server
    const bat = readFileSync(new URL('../nemesis.bat', import.meta.url), 'utf8');
    assert.match(bat, /repair-checkout\.mjs/);
    assert.ok(bat.indexOf('repair-checkout.mjs') < bat.indexOf('node server.mjs'), 'repair runs first');
    assert.ok(existsSync(TOOL));
});
