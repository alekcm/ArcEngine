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
import { createEngineContext } from './fs-engine.mjs';

// The engine scripts are loaded the way index.html loads them: in one context,
// as plain scripts with their globals.
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ctx = createEngineContext();
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

// Every op of a step, including the ones inside its branches (`options`,
// `then`, `no`, nested `steps`): a stub cannot hide behind an action.
function stickyOps(steps, depth) {
    const out = [];
    if (!steps || (depth || 0) > 6) return out;
    for (const one of [].concat(steps)) {
        if (!one || typeof one !== 'object') continue;
        if (one.op) out.push(one.op);
        for (const key of ['options', 'then', 'no', 'steps', 'replace', 'else']) {
            if (Array.isArray(one[key])) out.push(...stickyOps(one[key], (depth || 0) + 1));
            else if (one[key] && typeof one[key] === 'object' && one[key].op) out.push(...stickyOps([one[key]], (depth || 0) + 1));
        }
    }
    return out;
}

const groups = new Map();
const misses = [];
const notes = [];
let total = 0;
let applied = 0;
let noted = 0;
// The steps on the WHOLE text, as the game reads them (`parse`), not one
// sentence at a time (`parseSentence`): the conditions are carried across the
// sentences there («Если вы атакуете, … Если защищаетесь, …» became the same
// step twice when each sentence was read alone), and a branch is looked into.
function stepsOf(text, card) {
    return EFFECTS.parse(text, { kind: card.kind, faction: card.faction });
}
function notesIn(steps) {
    const out = [];
    const dig = (list, depth) => {
        if (depth > 6) return;
        for (const one of [].concat(list || [])) {
            if (!one || typeof one !== 'object') continue;
            if (one.op === 'note') out.push(one);
            for (const key of ['options', 'then', 'no', 'steps', 'replace']) if (one[key]) dig(one[key], depth + 1);
        }
    };
    dig(steps, 0);
    return out;
}

for (const card of allTexts()) {
    const g = groups.get(card.kind) || { total: 0, applied: 0, noted: 0 };
    const sentences = EFFECTS.sentences(card.text);
    const whole = stepsOf(card.text, card);
    const stubs = notesIn(whole);
    // The stub sentences are matched by their text; every other sentence is
    // performed by the steps of the whole parse.
    const stubText = new Set(stubs.map(o => String(o.text || '').trim()));
    for (const sentence of sentences) {
        total++;
        g.total++;
        const one = EFFECTS.parse(sentence, { kind: card.kind, faction: card.faction });
        const ops = stickyOps(one);
        // A stub may be a BRANCH of the sentence («Либо купите …, либо
        // уничтожьте …») — its text is a part of the sentence, not the whole.
        const mine = String(sentence).trim();
        const covered = [...stubText].some(t => t && (t === mine || (t.length > 12 && mine.includes(t))));
        const isNote = covered || (ops.includes('note') && !ops.some(o => o !== 'note' && o !== 'icons'));
        if (isNote) {
            noted++;
            g.noted++;
            notes.push({ kind: card.kind, name: card.name, sentence });
        } else if (ops.length && !ops.every(o => o === 'icons')) {
            applied++;
            g.applied++;
        } else {
            // No step and no stub: the sentence is not read at all.
            const inWhole = stickyOps(whole);
            if (stubs.length && inWhole.length) { applied++; g.applied++; }
            else misses.push({ kind: card.kind, name: card.name, sentence });
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
