// tools/fs-coverage.mjs — how many sentences of the cards the engine reads.
//
// The engine plays the cards by their text: FSEffects.parse breaks the text
// into the steps of the game. This tool counts the sentences that are read and
// shows the ones that are not — the work of the interpreter.
//
// The report has two numbers:
//   применено — the sentence becomes a step of the game (the engine acts);
//   пояснено  — the engine sees the sentence and shows it to the player, but
//               performs no action for it: the rule is applied by hand (or it
//               is a clarification of the text).
//
// "пояснено" is NOT proof that the card works by itself. The honest claim of
// this tool is: every sentence of every card is either a step of the engine or
// an explicit note; there are no sentences that the engine silently drops.
//
//   node tools/fs-coverage.mjs            — the report
//   node tools/fs-coverage.mjs --all      — the sentences that are not read
//   node tools/fs-coverage.mjs --notes    — the clarifications of the rules

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

// The engine scripts are loaded the way index.html loads them: in one context,
// as plain scripts with their globals.
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({
    console, Math, JSON, Date, Set, Map, Array, Object, Number, String, Boolean, Error,
    parseInt, parseFloat, isNaN, RegExp, Promise, Symbol, TypeError, RangeError,
});
for (const [file, name] of [['js/fs/FSData.js', 'FS_DATA'], ['js/fs/FSEffects.js', 'FS_EFFECTS']]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8') + `\n;globalThis.${name} = ${name};`,
        ctx, { filename: file });
}
const DATA = ctx.FS_DATA;
const EFFECTS = ctx.FS_EFFECTS;

/** All the texts of the cards with their kind. */
export function allTexts() {
    const out = [];
    for (const c of DATA.combat) {
        if (c.general) out.push({ kind: 'combat', faction: c.faction, name: c.name, text: c.general });
        if (c.unit) out.push({ kind: 'combat-unit', faction: c.faction, name: c.name, text: c.unit });
    }
    for (const c of DATA.events) {
        if (c.text) out.push({ kind: 'event', faction: c.faction, name: c.name, text: c.text });
    }
    for (const c of DATA.orders) {
        if (c.text) out.push({ kind: 'order', faction: c.faction, name: c.name, text: c.text });
    }
    for (const f of DATA.factions) {
        if (f.ability && f.ability.text) out.push({ kind: 'ability', faction: f.id, name: f.name, text: f.ability.text });
    }
    return out;
}

const groups = new Map();
const misses = [];
const notes = [];
let total = 0;
let applied = 0;
let noted = 0;
for (const card of allTexts()) {
    const g = groups.get(card.kind) || { total: 0, applied: 0, noted: 0 };
    for (const sentence of EFFECTS.sentences(card.text)) {
        total++;
        g.total++;
        const steps = EFFECTS.parseSentence(sentence, { kind: card.kind, faction: card.faction });
        const ops = steps.map(s => s.op);
        if (ops.length && ops[0] !== 'icons') {
            if (ops[0] === 'note') {
                noted++;
                g.noted++;
                notes.push({ kind: card.kind, name: card.name, sentence });
            } else {
                applied++;
                g.applied++;
            }
        } else {
            misses.push({ kind: card.kind, name: card.name, sentence });
        }
    }
    groups.set(card.kind, g);
}

const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
console.log('Forbidden Stars: сколько текстов читает движок');
console.log('────────────────────────────────────────────────');
for (const [kind, g] of groups) {
    console.log('  ' + kind.padEnd(12) + ' ' + String(g.applied).padStart(4) + ' / ' + String(g.total).padStart(4)
        + '  (' + String(pct(g.applied, g.total)).padStart(3) + ' %)'
        + '   пояснено: ' + String(g.noted).padStart(3));
}
console.log('────────────────────────────────────────────────');
console.log('  ВСЕГО         ' + String(applied).padStart(4) + ' / ' + String(total).padStart(4)
    + '  (' + String(pct(applied, total)).padStart(3) + ' %)'
    + '   пояснено: ' + String(noted).padStart(3));
console.log('  ── из них только пояснения (движок показывает текст, но сам не действует): ' + noted);

if (process.argv.includes('--notes')) {
    console.log('');
    console.log('Пояснения правил (движок показывает их игроку, поведение уже верное):');
    for (const n of notes) console.log('  [' + n.kind + '] ' + n.name + ': ' + n.sentence);
} else if (process.argv.includes('--all')) {
    console.log('');
    for (const m of misses) console.log('  [' + m.kind + '] ' + m.sentence);
} else {
    console.log('');
    console.log('Не прочитано: ' + misses.length + '. Список: node tools/fs-coverage.mjs --all');
    const kinds = new Map();
    for (const m of misses) kinds.set(m.kind, (kinds.get(m.kind) || 0) + 1);
    for (const [k, n] of kinds) console.log('  ' + k + ': ' + n);
}
