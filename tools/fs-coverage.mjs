// tools/fs-coverage.mjs — how many sentences of the cards the engine reads.
//
// The engine plays the cards by their text: FSEffects.parse breaks the text
// into the steps of the game. This tool counts the sentences that are read and
// shows the ones that are not — the work of the interpreter.
//
//   node tools/fs-coverage.mjs            — the report
//   node tools/fs-coverage.mjs --all      — the sentences that are not read

import { loadScripts } from '../tests/browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js']);
const DATA = get('FS_DATA');
const EFFECTS = get('FS_EFFECTS');

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
let total = 0;
let read = 0;
for (const card of allTexts()) {
    const g = groups.get(card.kind) || { total: 0, read: 0 };
    for (const sentence of EFFECTS.sentences(card.text)) {
        total++;
        g.total++;
        const steps = EFFECTS.parseSentence(sentence, { kind: card.kind, faction: card.faction });
        if (steps.length && steps[0].op !== 'icons') {
            read++;
            g.read++;
        } else {
            misses.push({ kind: card.kind, name: card.name, sentence });
        }
    }
    groups.set(card.kind, g);
}

console.log('Forbidden Stars: сколько текстов читает движок');
console.log('────────────────────────────────────────────────');
for (const [kind, g] of groups) {
    const pct = g.total ? Math.round(g.read / g.total * 100) : 0;
    console.log('  ' + kind.padEnd(12) + ' ' + String(g.read).padStart(4) + ' / ' + String(g.total).padStart(4)
        + '  (' + String(pct).padStart(3) + ' %)');
}
console.log('────────────────────────────────────────────────');
console.log('  ВСЕГО         ' + String(read).padStart(4) + ' / ' + String(total).padStart(4)
    + '  (' + String(Math.round(read / total * 100)).padStart(3) + ' %)');

if (process.argv.includes('--all')) {
    console.log('');
    for (const m of misses) console.log('  [' + m.kind + '] ' + m.sentence);
} else {
    console.log('');
    console.log('Не прочитано: ' + misses.length + '. Список: node tools/fs-coverage.mjs --all');
    const kinds = new Map();
    for (const m of misses) kinds.set(m.kind, (kinds.get(m.kind) || 0) + 1);
    for (const [k, n] of kinds) console.log('  ' + k + ': ' + n);
}
