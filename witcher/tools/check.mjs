// Single gate of the Witcher port: data freshness, syntax of every client/server module,
// the rules audit and bot games. node witcher/tools/check.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const node = (args) => spawnSync(process.execPath, args, { cwd: path.join(ROOT, '..'), stdio: 'inherit' });
const files = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.(m?js)$/.test(f)).map(f => path.join(ROOT, dir, f));
const STEPS = [
    ['данные из md актуальны', () => node([path.join(ROOT, 'tools/import.mjs'), '--check'])],
    ['события из md актуальны', () => node([path.join(ROOT, 'tools/events-gen.mjs'), '--check'])],
    ['маги из md актуальны', () => node([path.join(ROOT, 'tools/mages-gen.mjs'), '--check'])],
    ['синтаксис модулей', () => {
        for (const f of [...files('client'), ...files('shared'), ...files('shared/engine'), ...files('shared/data'), path.join(ROOT, 'server.mjs')]) {
            const r = node(['--check', f]); if (r.status) return r;
        }
        return { status: 0 };
    }],
    ['аудит правил и партии ботов', () => node(['--test', ...fs.readdirSync(path.join(ROOT, 'tools')).filter(f => f.endsWith('.test.mjs')).map(f => path.join(ROOT, 'tools', f))])],
];
const failed = [];
for (const [title, run] of STEPS) {
    console.log('\n  ' + title);
    const r = run();
    console.log(r.status === 0 ? '  ok' : '  FAIL');
    if (r.status !== 0) failed.push(title);
}
console.log(failed.length ? `\n  Не прошло: ${failed.join(', ')}\n` : '\n  Всё прошло.\n');
process.exit(failed.length ? 1 : 0);
