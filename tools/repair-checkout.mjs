// ============================================================================
//  repair-checkout.mjs — makes a checkout runnable again after a bad merge
// ----------------------------------------------------------------------------
//  A half-resolved merge leaves `<<<<<<< HEAD` inside a module, and Node dies
//  with "SyntaxError: Unexpected token '<<'" before the game even starts —
//  sometimes in a file the player never touched. This tool finds every tracked
//  file that still carries a conflict marker and puts back a clean version:
//
//    1. the committed version (HEAD), when it is clean;
//    2. otherwise the same file from a remote branch that has it clean
//       (upstream, then the newest origin/* branch), which also repairs a
//       marker that was committed by mistake.
//
//  It never touches a file that parses, prints exactly what it changed, and
//  exits 0 even when it cannot help — the game launcher calls it and must not
//  be blocked by it. Run it by hand any time:  node tools/repair-checkout.mjs
// ============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = /^(<{7}( |$)|={7}$|>{7}( |$))/m;
const MODULE = /\.(mjs|cjs|js|jsx|ts)$/i;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const tryGit = (args) => { try { return git(args); } catch { return null; } };
const hasMarkers = text => MARKER.test(text);
const say = (...a) => process.stdout.write(a.join(' ') + '\n');

/** A module with a marker is not a module: let Node itself have the last word. */
function parses(rel, text) {
    if (!MODULE.test(rel)) return true;
    let file;
    try {
        file = join(mkdtempSync(join(tmpdir(), 'repair-')), 'check' + (rel.match(/\.(mjs|cjs|js|jsx|ts)$/i) || ['.js'])[0]);
        writeFileSync(file, text);
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        return true;
    } catch { return false; }
}

/** Refs worth trying, best first: what is committed, then the newest remote copies. */
function sources() {
    const refs = [];
    const upstream = tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream && upstream.trim()) refs.push(upstream.trim());
    refs.push('HEAD');
    const remotes = tryGit(['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes']);
    for (const r of (remotes || '').split('\n')) if (r && !r.endsWith('/HEAD')) refs.push(r.trim());
    return [...new Set(refs)];
}

function main() {
    if (!existsSync(join(ROOT, '.git')) && !tryGit(['rev-parse', '--is-inside-work-tree'])) return 0;
    const listed = tryGit(['grep', '-l', '-E', '^<{7}( |$)', '--', '.']);
    const files = (listed || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!files.length) { say('  Копия чистая: маркеров конфликта нет.'); return 0; }

    say('  Найдены маркеры конфликта: ' + files.join(', '));
    const refs = sources();
    let repaired = 0, failed = [];
    for (const rel of files) {
        const clean = () => {
            for (const ref of refs) {
                const text = tryGit(['show', ref + ':' + rel]);
                if (text == null) continue;
                if (hasMarkers(text)) continue;
                if (!parses(rel, text)) continue;
                return { ref, text };
            }
            return null;
        };
        const found = clean();
        if (!found) { failed.push(rel); continue; }
        writeFileSync(join(ROOT, rel), found.text);
        say('  ✔ ' + rel + ' — восстановлен из ' + found.ref);
        repaired++;
    }

    // A merge that stopped mid-way keeps the index unmerged, and every later git command then
    // complains. The files are whole again, so the merge state itself has nothing left to resolve.
    if (repaired && existsSync(join(ROOT, '.git', 'MERGE_HEAD'))) {
        tryGit(['reset', '-q']);
        say('  Незавершённый merge снят (файлы уже восстановлены).');
    }
    if (failed.length) say('  ⚠ Не удалось восстановить: ' + failed.join(', ') + ' — возьмите эти файлы из рабочей ветки.');
    else say('  Готово: восстановлено файлов — ' + repaired + '.');
    return 0;
}

process.exitCode = main();
