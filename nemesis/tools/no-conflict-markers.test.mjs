// no-conflict-markers.test.mjs — a guard against the one bug that cannot be seen by reading a diff:
// a merge left `<<<<<<<` in a file and the whole game died with "SyntaxError: Unexpected token '<<'".
//   node --test nemesis/tools/no-conflict-markers.test.mjs
// Every tracked text file is scanned; the report names the file, the line and the marker, so a
// broken checkout is diagnosed in one run instead of one stack trace at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = /^(<{7}( |$)|={7}$|>{7}( |$)|\|{7}( |$))/;
const TEXT = /\.(mjs|cjs|js|jsx|ts|tsx|json|md|css|html|bat|sh|yml|yaml|txt|py|glsl|frag|vert)$/i;

function tracked() {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\0').filter(Boolean);
}

test('MERGE-01 no tracked file carries a leftover conflict marker', () => {
    const broken = [];
    for (const rel of tracked()) {
        if (!TEXT.test(rel)) continue;
        let size = 0;
        try { size = statSync(join(ROOT, rel)).size; } catch { continue; }     // deleted in the working tree
        if (!size || size > 4 * 1024 * 1024) continue;
        const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
        lines.forEach((line, i) => { if (MARKER.test(line)) broken.push(rel + ':' + (i + 1) + '  ' + line.slice(0, 40)); });
    }
    assert.deepEqual(broken, [], 'a merge was committed unresolved:\n' + broken.join('\n'));
});

test('MERGE-02 every server and engine module at least parses', () => {
    // Node cannot even import a module with a stray marker, and the failure in the browser looks like
    // "the game does not start" rather than "the file is broken". This catches it at the source.
    const files = tracked().filter(p => p.startsWith('nemesis/') && p.endsWith('.mjs') && !p.includes('/client/'));
    const failed = [];
    for (const rel of files) {
        try { execFileSync(process.execPath, ['--check', join(ROOT, rel)], { stdio: 'pipe' }); }
        catch (e) { failed.push(rel + ': ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')); }
    }
    assert.deepEqual(failed, [], failed.join('\n'));
});
