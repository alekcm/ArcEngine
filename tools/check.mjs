// ============================================================================
//  ArcEngine — code check: types (tsc) and the rules audit
// ----------------------------------------------------------------------------
//  node tools/check.mjs            types, the rules audit, the smoke test, the screens, the walk
//  node tools/check.mjs --types    types only
//  node tools/check.mjs --rules    the rules audit only
//  node tools/check.mjs --smoke    the smoke test only
//  node tools/check.mjs --screens  the screens only (fs-screens.mjs)
//  node tools/check.mjs --walk     the walk only (fs-walk.mjs): a party through the client's eyes
//
//  Types: TypeScript checks the JS via JSDoc — tsconfig.json (game) and
//  _utils/editor/tsconfig.json (editor). TypeScript is not a project dependency:
//  npx takes it from the npm cache (the first run downloads it). Babylon types —
//  libs/babylon.d.ts, own declarations — globals.d.ts. None of this goes into the archive.
//
//  Single source: tools/fs-single-source.mjs — у каждого правила одна реализация
//  (цена покупки, ценность жетона запасов); копия формулы валит проверку.
//
//  Rules audit: tools/fs-audit.mjs — every check quotes a line of the Rules
//  Reference (docs/forbidden-stars/01-rules-reference.md), builds the state of
//  exactly that case and looks at what the engine does. There are no unit tests
//  of the game: they missed rules and were replaced by this audit.
// ============================================================================
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TSC = 'npx --yes -p typescript@7.0.2 tsc';

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', cyn: '\x1b[36m' };

const STEPS = [
  { flag: '--types', title: 'типы игры', run: () => spawnSync(TSC + ' -p tsconfig.json', { cwd: ROOT, shell: true, stdio: 'inherit' }) },
  { flag: '--types', title: 'типы редактора', run: () => spawnSync(TSC + ' -p _utils/editor/tsconfig.json', { cwd: ROOT, shell: true, stdio: 'inherit' }) },
  { flag: '--rules', title: 'правила', run: () => spawnSync(process.execPath, ['tools/fs-audit.mjs'], { cwd: ROOT, stdio: 'inherit' }) },
  { flag: '--rules', title: 'единственность правил', run: () => spawnSync(process.execPath, ['tools/fs-single-source.mjs'], { cwd: ROOT, stdio: 'inherit' }) },
  { flag: '--smoke', title: 'дым', run: () => spawnSync(process.execPath, ['tools/fs-smoke.mjs'], { cwd: ROOT, stdio: 'inherit' }) },
  { flag: '--screens', title: 'экраны', run: () => spawnSync(process.execPath, ['tools/fs-screens.mjs'], { cwd: ROOT, stdio: 'inherit' }) },
  { flag: '--walk', title: 'проход', run: () => spawnSync(process.execPath, ['tools/fs-walk.mjs'], { cwd: ROOT, stdio: 'inherit' }) },
];

const only = ['--types', '--rules', '--smoke', '--screens', '--walk'].filter(f => process.argv.includes(f));
const failed = [];
console.log('\n' + C.cyn + C.b + '  ArcEngine' + C.r + ' ' + C.dim + '— проверка' + C.r);
for (const step of STEPS) {
  if (only.length && !only.includes(step.flag)) continue;
  console.log('\n' + C.b + '  ' + step.title + C.r);
  const r = step.run();
  if (r.status === 0) {
    console.log('  ' + C.grn + 'ok' + C.r);
  } else {
    failed.push(step.title);
    console.log('  ' + C.red + 'FAIL' + C.r + (r.error ? ' ' + r.error.message : ''));
  }
}
console.log('\n' + (failed.length
  ? C.red + C.b + '  Не прошло: ' + failed.join(', ') + C.r
  : C.grn + C.b + '  Всё прошло.' + C.r) + '\n');
process.exit(failed.length ? 1 : 0);
