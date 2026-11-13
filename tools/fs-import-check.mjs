// fs-import-check.mjs — reject missing, unknown and ambiguous storm icons.
// The importer runs against an isolated copy: the source documents and the
// generated game data are never modified by these negative tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-import-'));
try {
    for (const dir of ['tools', 'docs/forbidden-stars', 'js/fs']) fs.mkdirSync(path.join(temp, dir), { recursive: true });
    for (const file of ['tools/fs-import.mjs', 'js/fs/FSData.js',
        ...['02-factions.md', '03-systems.md', '04-combat-cards.md', '05-order-upgrades.md', '06-events.md']
            .map(name => 'docs/forbidden-stars/' + name)]) {
        fs.copyFileSync(path.join(root, file), path.join(temp, file));
    }
    const doc = path.join(temp, 'docs/forbidden-stars/06-events.md');
    const original = fs.readFileSync(doc, 'utf8');
    const run = () => spawnSync(process.execPath, [path.join(temp, 'tools/fs-import.mjs'), '--check'], { encoding: 'utf8' });
    const clean = run();
    if (clean.status !== 0) throw new Error('чистый импорт не прошёл: ' + clean.stderr);
    const cases = [
        ['неизвестная иконка после имени', '**Героическая атака** (⬆⬇⬆)', '**Героическая атака** (⬆↪)'],
        ['иконка пропущена', '**Героическая атака** (⬆⬇⬆)', '**Героическая атака**'],
        ['две иконки одной карты', '**Героическая атака** (⬆⬇⬆)', '**Героическая атака** (⬆⬇⬆) (⬅➡⬅)'],
        ['неизвестная иконка в типе', '**Моар бойз!** | ТАКТИКА (⬅➡⬅)', '**Моар бойз!** | ТАКТИКА (⬅↪)'],
        ['any только у Теософии', '**Моар бойз!** | ТАКТИКА (⬅➡⬅)', '**Моар бойз!** | ТАКТИКА (в любую сторону)'],
        ['ошибка в специальной иконке', '**Теософия** | ТАКТИКА (в любую сторону)', '**Теософия** | ТАКТИКА (неизвестно)'],
    ];
    for (const [name, from, to] of cases) {
        if (original.split(from).length !== 2) throw new Error('неоднозначный якорь: ' + name);
        fs.writeFileSync(doc, original.replace(from, to));
        const result = run();
        if (result.status === 0 || !/иконка шторма не распознана или неоднозначна/.test(result.stderr || '')) {
            throw new Error(name + ': импорт должен отказать именно из-за иконки; ' + result.stderr);
        }
        console.log('  ok  ' + name);
    }
    console.log('  Иконки импорта: ' + cases.length + ' отрицательных сценариев, 0 ошибок.');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
