// Exploration / event cards generator: reads the transcribed atlases in Witcher/События/*.md
// and writes witcher/shared/data/events-gen.mjs — the printed texts plus machine effects.
//
//   node witcher/tools/events-gen.mjs            regenerate + print a coverage report (-v: list)
//   node witcher/tools/events-gen.mjs --check    gate: fail if the generated file is stale
//
// Every printed effect sentence is translated by the phrase table below into the effect
// language of events-data.mjs. A card enters the exploration decks only if BOTH options are
// translated completely and every event card it leads to is supported too; the rest are listed
// in the report (and in UNSUPPORTED) so the next content slice knows what to add.
// The source files are never modified.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'Witcher/События');
const OUT = path.join(ROOT, 'witcher/shared/data/events-gen.mjs');

const ATLAS = [
    { file: 'Городские события 1.md', deck: 'city', short: 'Городские события 1' },
    { file: 'События мира 1.md', deck: 'wild', short: 'События мира 1' },
    { file: 'Ивенты 1.md', deck: null, short: 'Ивенты 1' },
];

const SKILL = { 'сражения': 'combat', 'защиты': 'defense', 'алхимии': 'alchemy', 'специализации': 'spec' };
const SKILL_IDS = Object.values(SKILL);
const TERRAIN = { 'лесная': 'forest', 'горная': 'mountain', 'водная': 'water' };
// «Положите эту карту перед собой» (event option kept in front of the player): the printed
// tail after that sentence is the card's lasting effect; the engine knows these kinds.
const KEEP = {
    'CITY1-04A': { kind: 'train', n: 3, name: 'Вырванная страница' },
    'CONT79-26B': { kind: 'blueDmg', name: 'Меч школы Журавля' },
    'CONT79-25B': { kind: 'elixirLimit', n: 5, name: 'Сумка для зелий' },
    'CONT79-32B': { kind: 'waterMove', name: 'Услуга гильдии купцов' },
    'CONT79-29B': { kind: 'nextExplore', event: 30, name: 'Обиженные бандиты' },
    'CITY1-33A': { kind: 'nextExplore', event: 55, name: 'Слава героя' },
    'CONT79-22B': { kind: 'nextExplore', gold: 4, name: 'Шкатулка с драгоценностями' },
};
let CUR = '';   // card id + option letter while parsing (for KEEP)
const num = (s) => ({ 'одну': 1, 'одна': 1 })[s] || Number(s);

const clean = (s) => s
    .replace(/\[СОБЫТИЕ:(\d+)\]\((?:<[^>]*>|#[^)]*)\)/g, '[СОБЫТИЕ:$1]')
    .replace(/\[([^\]]+)\]\((?:<[^>]*>|#[^)]*)\)/g, '$1')
    .replace(/✦\s*/g, '')
    .replace(/\*\*/g, '').replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** One effect sentence → effect list, or null when the phrase is not supported yet. */
function sentence(s) {
    s = s.replace(/[.\s]+$/, '').trim();
    s = cap(s.replace(/^(?:Затем|Также|Потом),?\s+/i, ''));
    if (!s) return [];
    let m;
    if ((m = s.match(/^Если у вас (\d+) (золот[а-яё]*|эликсир[а-яё]*) или меньше, (.+)$/))) {
        const fx = sentence(m[3]);
        return fx && [{ if: { [m[2].startsWith('золот') ? 'goldMax' : 'elixirMax']: Number(m[1]) }, fx }];
    }
    if ((m = s.match(/^Если ваш уровень щита равен 0, (.+)$/))) { const fx = sentence(m[1]); return fx && [{ if: { shieldMax: 0 }, fx }]; }
    if ((m = s.match(/^Если у вас нет трофеев, (.+)$/))) { const fx = sentence(m[1]); return fx && [{ if: { trophiesMax: 0 }, fx }]; }
    if ((m = s.match(/^Немедленно перейдите к фазе III и во время неё возьмите из своей колоды на (\d+) карт[уы]? (больше|меньше)$/))) return [{ draw: (m[2] === 'больше' ? 1 : -1) * num(m[1]) }, { toPhase3: true }];
    // «Возьмите X и Y» → two effects
    if ((m = s.match(/^Возьмите (.+?) и (\d.+)$/))) {
        const a = sentence('Возьмите ' + m[1]), b = sentence('Возьмите ' + m[2]);
        return a && b ? [...a, ...b] : null;
    }
    if ((m = s.match(/^Возьмите (\d+) золот(о|а)$/))) return [{ gold: num(m[1]) }];
    if ((m = s.match(/^Сбросьте (\d+) золот(о|а)$/))) return [{ gold: -num(m[1]) }];
    if ((m = s.match(/^Увеличьте свой навык (сражения|защиты|алхимии|специализации) на 1$/))) return [{ skill: SKILL[m[1]] }];
    if ((m = s.match(/^Понизьте свой навык (сражения|защиты|алхимии|специализации) на 1$/))) return [{ skillDown: SKILL[m[1]] }];
    if (/^Увеличьте свой навык наименьшего уровня на 1$/.test(s)) return [{ skill: 'lowest' }];
    if (/^Увеличьте 2 своих навыка наименьших уровней на 1$/.test(s)) return [{ skill: 'lowest2' }];
    if (/^Увеличьте любой свой навык на 1$/.test(s)) return [{ skill: 'any' }];
    if ((m = s.match(/^Понизьте свой уровень щита на (\d+)$/))) return [{ shield: -num(m[1]) }];
    if (/^Понизьте свой уровень щита до 0$/.test(s)) return [{ shield: -99 }];
    if ((m = s.match(/^(?:Увеличьте|Повысьте) свой уровень щита на (\d+)$/))) return [{ shield: num(m[1]) }];
    if ((m = s.match(/^В фазу III возьмите из своей колоды на (\d+) карт[уы]? (больше|меньше)$/))) return [{ draw: (m[2] === 'больше' ? 1 : -1) * num(m[1]) }];
    if ((m = s.match(/^Возьмите до (\d+) эликсиров \(игнорируя лимит\)$/))) return [{ elixir: num(m[1]), noLimit: true }];
    if ((m = s.match(/^Возьмите (?:до )?(\d+) эликсир(а|ов)?$/))) return [{ elixir: num(m[1]) }];
    if ((m = s.match(/^Сбросьте (\d+) эликсир(а|ов)?$/))) return [{ elixirLoss: num(m[1]) }];
    if (/^Сбросьте все свои эликсиры$/.test(s)) return [{ elixirLoss: 99 }];
    if ((m = s.match(/^Сбросьте (\d+) карт[уы]? из руки$/))) return [{ discardHand: num(m[1]) }];
    if ((m = s.match(/^Возьмите (\d+) карт[уы]? из своей колоды$/))) return [{ drawNow: num(m[1]) }];
    if (/^Немедленно перейдите к фазе III$/.test(s)) return [{ toPhase3: true }];
    if (/^Вы не можете исследовать локацию в этот ход$/.test(s)) return [{ noExplore: true }];
    if (/^Возьмите 1 любой жетон следа$/.test(s)) return [{ track: 'any' }];
    if (/^Возьмите по 1 жетону следа каждого типа, которого у вас ещё нет$/.test(s)) return [{ track: 'all' }];
    if (/^Уберите 1 свою карту из игры$/.test(s)) return [{ removeCard: 1 }];
    if ((m = s.match(/^Возьмите (?:1 )?(?:любую )?(первую \(самую левую\) )?карту (?:действия )?со стоимостью (\d) из ряда на поле и положите (?:её|ее) в свой сброс$/))) return [{ rowCard: m[1] ? { cost: num(m[2]), leftmost: true } : { cost: num(m[2]) } }];
    if (/^Возьмите 1 любую карту (?:действия )?из ряда на поле и положите (?:её|ее) в свой сброс$/.test(s)) return [{ rowCard: {} }];
    if (/^Переместитесь в соседнюю локацию не сбрасывая карты, затем можете выполнить (?:её|ее) действие$/.test(s)) return [{ freeMove: true }];
    if ((m = s.match(/^(?:Возьмите|Игрок справа берёт) \[СОБЫТИЕ:(\d+)\](?: и зачитывает вам)?$/))) return [{ event: Number(m[1]) }];
    if ((m = s.match(/^Сбросьте \[СОБЫТИЕ:(\d+)\]$/))) return [{ dropGear: Number(m[1]) }];
    if (/^В фазу III этого хода, получая карту из ряда на поле, не платите (?:её|ее) стоимость$/.test(s)) return [{ freeBuy: true }];
    if (/^Увеличьте свой уровень щита до своего максимума$/.test(s)) return [{ shield: 99 }];
    if ((m = s.match(/^Возьмите (\d+) карт[уы]?$/))) return [{ drawNow: num(m[1]) }];
    if (/^Уберите из игры 1 свою карту$/.test(s)) return [{ removeCard: 1 }];
    return null;
}

/** Plain effect text → { fx, bad } (quests are cut out first: they contain inner periods). */
function effects(text) {
    const bad = [];
    const fx = [];
    let t = ' ' + text + ' ';
    const tail = '\\.\\s*В локации:\\s*(?:сбросьте (\\d+) золот(?:о|а), чтобы взять |возьмите )?\\[СОБЫТИЕ:(\\d+)\\]\\.?';
    const qT = new RegExp('Задание:\\s*(лесная|горная|водная) локация' + tail);
    const qL = new RegExp('Задание:\\s*([А-ЯЁ][А-ЯЁа-яё’ -]+?)\\s*\\((\\d+)\\)' + tail);
    const qS = new RegExp('Задание:\\s*локация вашей школы' + tail);
    let quest = null, m;
    if ((m = t.match(qT))) { quest = { terrain: TERRAIN[m[1]], gold: m[2] ? Number(m[2]) : 0, num: Number(m[3]) }; t = t.replace(m[0], ' '); }
    else if ((m = t.match(qL))) { quest = { loc: Number(m[2]), gold: m[3] ? Number(m[3]) : 0, num: Number(m[4]) }; t = t.replace(m[0], ' '); }
    else if ((m = t.match(qS))) { quest = { school: true, gold: m[1] ? Number(m[1]) : 0, num: Number(m[2]) }; t = t.replace(m[0], ' '); }
    else if (/Задание/.test(t)) bad.push(t.match(/Задание[^.]*\.[^.]*\./)?.[0] || 'Задание');
    let keep = null;
    if ((m = t.match(/Положите эту карту перед собой\.\s*(.*)$/s))) {
        t = t.slice(0, m.index);
        if (KEEP[CUR]) keep = { id: CUR, card: CUR.slice(0, -1), ...KEEP[CUR], text: m[1].trim() };
        else bad.push('Положите эту карту перед собой.');
    }
    for (const s of t.split(/(?<=[.!])\s+/)) {
        if (!s.trim()) continue;
        const els = s.trim().match(/^В противном случае (.+)$/);
        const last = fx[fx.length - 1];
        if (els && last && last.if && !last.else) { const r = sentence(els[1]); if (r) { last.else = r; continue; } }
        const r = sentence(s.trim());
        if (r) fx.push(...r); else bad.push(s.trim());
    }
    if (quest) fx.push({ quest });
    if (keep) fx.push({ keep });
    return { fx, bad };
}

const RANGE = /^(?:\*\*)?(\d+)(?:[–-](\d+)|(\+))?(?: урона)?:(?:\*\*)?\s*/;
// «Возьмите N карт из своей колоды и немедленно разыграйте комбинацию…» (CONT79-07/12/19/27).
const COMBO = /\s*Возьмите (\d+) карт[уы]? из своей колоды и немедленно разыграйте комбинацию\. Примените только щиты и урон, а остальные эффекты проигнорируйте\. Затем выполните эффект согласно количеству урона в комбинации:\*\*$/;
const X2 = /^\*\*Умножьте уровень своего навыка (сражения|защиты|алхимии|специализации) на 2\. Затем бросьте кубик и прибавьте выпавшее значение к результату\. Выполните эффект согласно получившейся сумме:\*\*$/;
const OR_ANY = /^\*\*Если этот навык уже на максимальном уровне, то вместо этого увеличьте любой свой навык на 1\.\*\*$/;
const COND = /^\*\*Если ваш (?:навык (сражения|защиты|алхимии|специализации)|(уровень ведьмака)) равен (\d)(?:[–-](\d))?:\*\*\s*/;
const ALSO = /^\*\*Также,? \(?при любом результате(?: броска)?\)?:\*\*\s*|^\*\*Также,? \(?при любом результате(?: броска)?\)?:\s*/;

/**
 * Effect section of an option (or of a numbered card) as raw paragraphs → effect data.
 * Handles «Бросьте кубик» with «N–M:» branches, «Если ваш навык X равен N–M:» branches and
 * «Также (при любом результате)» tails. Returns { story, effect, fx, bad, branches? }.
 */
function section(paras) {
    // Split inline markers into their own paragraphs.
    const ps = [];
    for (let p of paras) {
        p = p.replace(/^(\*\*[^*]+?)\s+Бросьте кубик\.\s*(\d+(?:[–-]\d+)?:\*\*)/, '$1**\n\n**Бросьте кубик:**\n\n**$2');
        p = p.replace(/\*\*Бросьте кубик\.\s*/g, '**Бросьте кубик:**\n\n**').replace(/\*\*\*\*/g, '');
        p = p.replace(/\s(\*\*\d+(?:[–-]\d+)?:\*\*)/g, '\n\n$1').replace(/\s(\*\*Также)/g, '\n\n$1');
        ps.push(...paragraphs(p));
    }
    const story = [], pre = [], post = [], branches = [];
    let mode = 'story', by = null, cur = null, x2 = false, orAny = false, head = null, comboDraw = 0;
    const bad = [];
    for (const p of ps) {
        let m;
        if ((m = p.match(X2))) { mode = 'roll'; by = SKILL[m[1]]; x2 = true; head = clean(p); continue; }
        if (OR_ANY.test(p)) { orAny = true; continue; }
        if ((m = p.match(COMBO))) {
            const before = p.slice(0, m.index).trim();
            if (before && before !== '**') pre.push(before + '**');
            mode = 'roll'; by = 'combo'; comboDraw = Number(m[1]); head = clean(m[0]); continue;
        }
        if (/^\**Бросьте кубик:?\**:?$/.test(p.replace(/\*\*/g, '**'))) { mode = 'roll'; by = 'die'; continue; }
        if ((m = p.match(RANGE)) && (mode === 'roll' || mode === 'story' || mode === 'pre' || mode === 'branch')) {
            mode = 'branch'; by = by || 'die';
            cur = { from: Number(m[1]), to: m[3] ? 99 : Number(m[2] || m[1]), text: [], eff: [] };
            branches.push(cur);
            const rest = p.slice(m[0].length).trim();
            if (rest) (sentencesOk(rest) ? cur.eff : cur.text).push(rest);
            continue;
        }
        if ((m = p.match(COND))) {
            mode = 'branch'; by = m[2] ? 'level' : SKILL[m[1]];
            cur = { from: Number(m[3]), to: Number(m[4] || m[3]), text: [], eff: [] };
            branches.push(cur);
            const rest = p.slice(m[0].length).trim();
            if (rest) (sentencesOk(rest) ? cur.eff : cur.text).push(rest);
            continue;
        }
        if ((m = p.match(ALSO))) { mode = 'post'; const rest = p.slice(m[0].length).trim(); if (rest) post.push(rest); continue; }
        const isBold = p.startsWith('**');
        if (mode === 'branch') { (isBold || sentencesOk(p) ? cur.eff : cur.text).push(p); continue; }
        if (mode === 'post') { post.push(p); continue; }
        if (isBold) { mode = 'pre'; pre.push(p); continue; }
        if (mode === 'story') story.push(p); else pre.push(p);
    }
    const fx = [];
    const pe = effects(pre.map(clean).join(' ')); fx.push(...pe.fx); bad.push(...pe.bad);
    let out = null;
    if (branches.length) {
        out = branches.map(b => {
            const e = effects(b.eff.map(clean).join(' '));
            bad.push(...e.bad);
            return { from: b.from, to: b.to, text: b.text.map(clean).join(' '), effect: b.eff.map(clean).join(' '), fx: e.fx };
        });
        if (orAny) for (const b of out) for (const e of b.fx) if (e.skill && SKILL_IDS.includes(e.skill)) e.orAny = true;
        fx.push(by === 'die' ? { roll: out } : x2 ? { roll: out, by, x2: true } : by === 'combo' ? { roll: out, by, comboDraw } : { roll: out, by });
    }
    const po = effects(post.map(clean).join(' ')); fx.push(...po.fx); bad.push(...po.bad);
    const effLines = [...pre.map(clean)];
    if (head) effLines.push(head);
    if (branches.length) {
        if (by === 'die') effLines.push('Бросьте кубик:');
        for (const b of out) effLines.push(by === 'combo' ? `${b.to >= 99 ? b.from + '+' : b.from === b.to ? b.from : b.from + '–' + b.to} урона: ${[b.text, b.effect].filter(Boolean).join(' ')}` : `${by === 'die' || x2 ? '' : (by === 'level' ? 'Если уровень ведьмака' : 'Если навык ' + Object.keys(SKILL).find(k => SKILL[k] === by)) + ' равен '}${b.from === b.to ? b.from : b.from + '–' + b.to}: ${[b.text, b.effect].filter(Boolean).join(' ')}`);
    }
    if (orAny) effLines.push('Если этот навык уже на максимальном уровне, то вместо этого увеличьте любой свой навык на 1.');
    if (post.length) effLines.push('При любом результате: ' + post.map(clean).join(' '));
    return { story: story.map(clean).join('\n'), effect: effLines.join('\n'), fx, bad, branches: out, by };
}
function sentencesOk(p) {
    const t = clean(p);
    return t.split(/(?<=[.!])\s+/).every(s => !s.trim() || sentence(s.trim())) || /Задание:/.test(t);
}

/** Option label: a printed cost («Сбросьте 1 золото») is part of the line. */
function optionCost(label) {
    const m = label.match(/Сбросьте (\d+) золот(о|а)/);
    if (m) return { gold: Number(m[1]) };
    if (/Сбросьте|Уберите/.test(label)) return { unknown: true };
    return null;
}

function paragraphs(s) { return s.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); }

function parseAtlas(a) {
    const text = fs.readFileSync(path.join(SRC, a.file), 'utf8');
    const cards = {};
    for (const chunk of text.split(/\n### /).slice(1)) {
        const head = chunk.split('\n')[0];
        const [id, pos] = head.split(' — ').map(x => x.trim());
        const body = chunk.slice(head.length).replace(/\n<a id=[^\n]*\n?/g, '\n');
        const card = { src: `${a.short} · ${pos}` };
        const [pre, post] = body.split(/\n---\n/);
        const preP = paragraphs(pre).filter(p => !p.startsWith('#'));
        if (!post) {
            // Numbered card without a choice: equipment/companion or intro + effect.
            const g = preP[0] && preP[0].match(/^\*\*(Снаряжение|Спутник)\s*—\s*([^.*]+)\.\*\*/);
            if (g) {
                card.gear = true; card.kind = g[1]; card.name = g[2].trim();
                const rest = preP.slice(1);
                const story = rest.filter(p => !p.startsWith('**')).map(clean).join('\n');
                if (story) card.story = story;
                card.text = rest.filter(p => p.startsWith('**')).map(clean).join(' ');
            }
            else {
                CUR = id + 'A';
                const sec = section(preP);
                card.intro = sec.story;
                card.effect = sec.effect;
                card.fx = sec.fx; card.bad = sec.bad;
            }
        } else {
            card.intro = preP.filter(p => !/^\*\*(А|Б)\*\*/.test(p)).map(clean).join('\n');
            for (const p of preP) {
                const m = p.match(/^\*\*(А|Б)\*\*\s*(.+)$/s);
                if (m) card[m[1] === 'А' ? 'a' : 'b'] = { label: clean(m[2]) };
            }
            const segs = ('\n' + post).split(/\n\*\*(А|Б)\*\*\s*/);
            for (let i = 1; i < segs.length; i += 2) {
                const k = segs[i] === 'А' ? 'a' : 'b';
                CUR = id + segs[i].replace('А', 'A').replace('Б', 'B');
                const sec = section(paragraphs(segs[i + 1]));
                const o = card[k] || (card[k] = { label: '' });
                o.outcome = sec.story;
                o.effect = sec.effect;
                o.fx = sec.fx; o.bad = sec.bad;
                const c = optionCost(o.label);
                if (c && c.unknown) o.bad.push('стоимость: ' + o.label);
                else if (c) o.cost = c;
            }
        }
        cards[id] = card;
    }
    return cards;
}

const all = {};
const decks = { city: [], wild: [] };
for (const a of ATLAS) {
    const c = parseAtlas(a);
    Object.assign(all, c);
    if (a.deck) decks[a.deck].push(...Object.keys(c));
}
// Event numbers: [СОБЫТИЕ:N] → CONT79-NN (Ивенты 1, cell N; see the atlas notes).
const evId = (n) => `CONT79-${String(n).padStart(2, '0')}`;
// Equipment and companions the engine implements (fight.mjs, turn.mjs, explore.mjs).
const GEAR_OK = new Set(['CONT79-01', 'CONT79-05', 'CONT79-11', 'CONT79-13', 'CONT79-14', 'CONT79-15', 'CONT79-16',
    'CONT79-18', 'CONT79-20', 'CONT79-23', 'CONT79-28', 'CONT79-31', 'CONT79-50', 'CONT79-56']);
const why = {};
function fxRefs(fx, out = []) {
    for (const e of fx || []) {
        if (e.event) out.push(evId(e.event));
        if (e.quest) out.push(evId(e.quest.num));
        if (e.keep && e.keep.event) out.push(evId(e.keep.event));
        if (e.roll) for (const b of e.roll) fxRefs(b.fx, out);
        if (e.if) { fxRefs(e.fx, out); fxRefs(e.else, out); }
    }
    return out;
}
function supported(id, seen = new Set()) {
    if (why[id] !== undefined) return !why[id];
    if (seen.has(id)) return true;
    seen.add(id);
    const c = all[id];
    let reason = '';
    if (!c) reason = 'нет карты';
    else if (c.gear) reason = GEAR_OK.has(id) ? '' : `${c.kind.toLowerCase()} «${c.name}» ещё не реализован`;
    else {
        const parts = c.a ? [c.a, c.b] : [c];
        for (const o of parts) {
            if (!o || !o.fx) { reason = 'нет текста'; break; }
            if (o.bad.length) { reason = 'эффект: ' + o.bad[0]; break; }
            const bad = fxRefs(o.fx).find(r => !supported(r, seen));
            if (bad) { reason = `ведёт к ${bad}: ${why[bad]}`; break; }
        }
    }
    why[id] = reason;
    return !reason;
}
for (const id of Object.keys(all)) supported(id);

// Rewrite event numbers to ids, drop helper fields.
function finish(fx) {
    return fx.map(e => {
        if (e.event) return { event: evId(e.event) };
        if (e.dropGear) return { dropGear: evId(e.dropGear) };
        if (e.keep) return e.keep.event ? { keep: { ...e.keep, event: evId(e.keep.event) } } : e;
        if (e.quest) { const q = { event: evId(e.quest.num) }; for (const k of ['terrain', 'loc', 'school', 'gold']) if (e.quest[k]) q[k] = e.quest[k]; return { quest: q }; }
        if (e.roll) return { ...e, roll: e.roll.map(b => ({ from: b.from, to: b.to, text: b.text, effect: b.effect, fx: finish(b.fx) })) };
        if (e.if) return e.else ? { if: e.if, fx: finish(e.fx), else: finish(e.else) } : { if: e.if, fx: finish(e.fx) };
        return e;
    });
}
const outCards = {};
for (const [id, c] of Object.entries(all)) {
    if (why[id]) continue;
    const o = { ...c };
    for (const k of ['a', 'b']) if (o[k]) { o[k] = { ...o[k], fx: finish(o[k].fx) }; delete o[k].bad; }
    if (o.fx) o.fx = finish(o.fx);
    delete o.bad;
    if (o.event) o.num = Number(id.slice(-2));
    if (/^CONT79-/.test(id)) o.num = Number(id.slice(-2));
    outCards[id] = o;
}
const DECKS = { city: decks.city.filter(id => !why[id]), wild: decks.wild.filter(id => !why[id]) };
const UNSUP = Object.fromEntries(Object.entries(why).filter(([, r]) => r));
const js = `// GENERATED by witcher/tools/events-gen.mjs from Witcher/События/*.md — do not edit by hand;
// hand-tuned overrides live in events-data.mjs. ${Object.keys(outCards).length} cards supported.
export const GEN_DECKS = ${JSON.stringify(DECKS)};
export const GEN_EVENTS = ${JSON.stringify(outCards, null, 1)};
/** Cards not playable yet and why (next content slices). */
export const UNSUPPORTED = ${JSON.stringify(UNSUP, null, 1)};
`;
if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== js) { console.error('events-gen.mjs устарел: запустите node witcher/tools/events-gen.mjs'); process.exit(1); }
    console.log('events-gen.mjs актуален');
    process.exit(0);
}
fs.writeFileSync(OUT, js);
console.log(`город: ${DECKS.city.length}/${decks.city.length}, окрестности: ${DECKS.wild.length}/${decks.wild.length}, всего карт: ${Object.keys(outCards).length}`);
if (process.argv.includes('-v')) for (const [id, r] of Object.entries(UNSUP)) console.log(' ', id, '—', r);
