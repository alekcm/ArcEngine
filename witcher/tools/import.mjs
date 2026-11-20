// ============================================================================
//  Witcher: Old World — data importer
// ----------------------------------------------------------------------------
//  Reads the Markdown transcription in ../../Witcher/ and writes
//  witcher/shared/data/gen-data.mjs. The generated file is never edited by hand:
//  a fix to a card goes into the Markdown, then `node witcher/tools/import.mjs`.
//
//    node witcher/tools/import.mjs          write gen-data.mjs
//    node witcher/tools/import.mjs --check  fail if gen-data.mjs is stale
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(REPO, 'Witcher');
const OUT = path.join(HERE, '..', 'shared', 'data', 'gen-data.mjs');

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const cells = (line) => line.split('|').slice(1, -1).map(s => s.trim());
const stripAnchor = (s) => s.replace(/<a id="[^"]*"><\/a>/g, '').trim();
const fail = (msg) => { throw new Error('import: ' + msg); };

const COLOR = { 'Синий': 'blue', 'Красный': 'red', 'Зелёный': 'green', 'Фиолетовый': 'purple', 'Жёлтый': 'yellow' };
const LINK_COLOR = {
    'С': 'blue', 'К': 'red', 'З': 'green', 'Ф': 'purple', 'Ж': 'yellow',
    'Синяя': 'blue', 'Красная': 'red', 'Зелёная': 'green', 'Фиолетовая': 'purple', 'Жёлтая': 'yellow',
};
const TERRAIN = { 'Горы': 'mountain', 'Лес': 'forest', 'Вода': 'water', 'Джокер': 'joker' };

/** "У1; Щ1; Д+1; Верх сброса; вернуть эту" -> { dmg, shield, draw, top, ret } */
function parseEffects(text, where) {
    const fx = {};
    if (!text || text === 'Нет' || text === 'без бонуса') return fx;
    for (const raw of text.split(';')) {
        const t = raw.trim().replace(/−/g, '-');
        let m;
        if ((m = /^У(\d+)$/.exec(t))) fx.dmg = (fx.dmg || 0) + Number(m[1]);
        else if ((m = /^Щ(\d+)$/.exec(t))) fx.shield = (fx.shield || 0) + Number(m[1]);
        else if ((m = /^Д([+-]\d+)$/.exec(t))) fx.draw = (fx.draw || 0) + Number(m[1]);
        else if (t === 'Верх сброса') fx.top = 1;
        else if (t === 'вернуть эту') fx.ret = 1;
        else if (t === 'без бонуса') { /* link without bonus */ }
        else fail(`unknown effect "${t}" in ${where}`);
    }
    return fx;
}

/** "К — У1; С — без бонуса" -> [{ color, fx }] */
function parseLinks(text, where) {
    if (!text || text === 'Нет') return [];
    const out = [];
    // A link is "<colour> — <bonus>"; bonuses themselves may contain ';' only between links.
    for (const part of text.split(';')) {
        const p = part.trim();
        if (!p) continue;
        const m = /^(\S+)\s+—\s+(.+)$/.exec(p);
        if (!m) {
            // continuation of the previous link's bonus ("К — У1; Д+1" style)
            if (!out.length) fail(`bad link "${p}" in ${where}`);
            Object.assign(out[out.length - 1].fx, mergeFx(out[out.length - 1].fx, parseEffects(p, where)));
            continue;
        }
        const color = LINK_COLOR[m[1]];
        if (!color) fail(`unknown link colour "${m[1]}" in ${where}`);
        out.push({ color, fx: parseEffects(m[2], where) });
    }
    return out;
}
function mergeFx(a, b) {
    const r = { ...a };
    for (const k of Object.keys(b)) r[k] = (r[k] || 0) + b[k];
    return r;
}

// ---------------------------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------------------------
const HERO_SCHOOL = { 'Эрим': 'wolf', 'Кайлар': 'cat', 'Ауфар': 'bear', 'Джаспер': 'viper', 'Годрик': 'griffin', 'Алувар': 'manticore', 'Цири': 'ciri' };

function importStarter() {
    const md = read('Ведьмаки/Начальные колоды.md');
    const cards = [];
    let school = null;
    for (const line of md.split('\n')) {
        const h = /^## (\S+)/.exec(line);
        if (h) { school = HERE_SCHOOL_OR_NULL(h[1]); continue; }
        if (!line.startsWith('| <a id="w-start-')) continue;
        const c = cells(line);
        const id = stripAnchor(c[0]);
        if (!school) fail('starter card outside a school section: ' + id);
        cards.push({
            id, cell: c[1], name: c[2], color: COLOR[c[3]] || fail('colour ' + c[3]),
            terrain: TERRAIN[c[4]] || fail('terrain ' + c[4]), cost: 0,
            fx: parseEffects(c[5], id), links: parseLinks(c[6], id), school, starter: true,
        });
    }
    return cards;
}
function HERE_SCHOOL_OR_NULL(name) { return HERO_SCHOOL[name] || null; }

function importCommon() {
    const md = read('Ведьмаки/Общие действия.md');
    const cards = [];
    for (const line of md.split('\n')) {
        if (!/^\| <a id="w-[ab]-/.test(line)) continue;
        const c = cells(line);
        const id = stripAnchor(c[0]);
        cards.push({
            id, cell: c[1], name: c[2], color: COLOR[c[3]] || fail('colour ' + c[3] + ' ' + id),
            terrain: TERRAIN[c[4]] || fail('terrain ' + c[4] + ' ' + id), cost: Number(c[5]),
            fx: parseEffects(c[6], id), links: parseLinks(c[7], id),
        });
    }
    return cards;
}

// ---------------------------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------------------------
const ROMAN = { I: 1, II: 2, III: 3 };
function importMonsters() {
    const md = read('Монстры/Карты монстров.md');
    const out = [];
    for (const line of md.split('\n')) {
        const m = /^\| (MON-\d\d) \| \[([^\]]+)\]\(#mon-\d\d\) \| (r\dc\d) \| (I+) \| (\d+) \| \[([^\]]+)\]/.exec(line);
        if (!m) continue;
        out.push({ id: m[1], name: m[2], cell: m[3], level: ROMAN[m[4]], life: Number(m[5]), model: m[6] });
    }
    const sections = md.split(/<a id="mon-(\d\d)"><\/a>/);
    for (let i = 1; i < sections.length; i += 2) {
        const id = 'MON-' + sections[i];
        const body = sections[i + 1];
        const a = /\*\*Напечатанная особая способность:\*\*\s*(.+)/.exec(body);
        const mon = out.find(x => x.id === id);
        if (mon && a) mon.ability = a[1].trim();
    }
    const tmd = read('Монстры/Трофеи монстров.md');
    const ts = tmd.split(/<a id="mon-trophy-(\d\d)"><\/a>/);
    for (let i = 1; i < ts.length; i += 2) {
        const id = 'MON-' + ts[i];
        const body = ts[i + 1];
        const g = /\*\*Игровой текст:\*\*\s*([\s\S]+?)(?:\n\n<a |\n\n## |$)/.exec(body);
        const mon = out.find(x => x.id === id);
        if (mon && g) mon.trophy = g[1].replace(/\n+/g, ' ').trim();
    }
    for (const m of out) {
        if (!m.ability) fail('no ability for ' + m.id);
        if (!m.trophy) fail('no trophy for ' + m.id);
    }
    return out;
}

/** Monster combat deck. Attack kinds: dmg N | dmgLvl [a,b,c] | skill(name)+dmgLvl | dmgSkill name | remove1 | randDiscard [1,2,3] */
function parseAttack(t, id) {
    let m;
    t = t.replace(/−/g, '-');
    if ((m = /^Урон (\d+)$/.exec(t))) return { k: 'dmg', n: Number(m[1]) };
    if ((m = /^Урон (\d+)\/(\d+)\/(\d+)$/.exec(t))) return { k: 'dmg', lvl: [Number(m[1]), Number(m[2]), Number(m[3])] };
    if ((m = /^(Алхимия|Сражение|Защита) -1; урон (\d+)\/(\d+)\/(\d+)$/.exec(t))) {
        return { k: 'skill', skill: { 'Алхимия': 'alchemy', 'Сражение': 'combat', 'Защита': 'defense' }[m[1]], lvl: [Number(m[2]), Number(m[3]), Number(m[4])] };
    }
    if ((m = /^Урон = (защита|алхимия|специализация|сражение)$/.exec(t))) {
        return { k: 'dmgSkill', skill: { 'защита': 'defense', 'алхимия': 'alchemy', 'специализация': 'spec', 'сражение': 'combat' }[m[1]] };
    }
    if (t === 'Удалить 1') return { k: 'remove', n: 1 };
    if ((m = /^Случайный сброс (\d+)\/(\d+)\/(\d+)$/.exec(t))) return { k: 'randDiscard', lvl: [Number(m[1]), Number(m[2]), Number(m[3])] };
    return fail(`unknown monster attack "${t}" in ${id}`);
}
function importAttacks() {
    const md = read('Монстры/Боевая колода.md');
    const out = [];
    for (const line of md.split('\n')) {
        if (!line.startsWith('| <a id="mon-atk-')) continue;
        const c = cells(line);
        const id = stripAnchor(c[0]);
        out.push({ id, cell: c[1], strike: parseAttack(c[2], id), bite: parseAttack(c[3], id), strikeText: c[2], biteText: c[3] });
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Elixirs, trophies
// ---------------------------------------------------------------------------------------------
function importPotions() {
    const md = read('Доп колоды/Зелья.md');
    const out = [];
    const re = /## (POTION-\d\d) — (.+)\n\n\*\*Источник:\*\* `(r\dc\d)`\.\n\n\*\*Эффект:\*\* (.+)/g;
    let m;
    while ((m = re.exec(md))) out.push({ id: m[1], name: m[2].trim(), cell: m[3], text: m[4].trim(), copies: 4 });
    if (out.length !== 7) fail('expected 7 elixirs, got ' + out.length);
    return out;
}
function importSkillTrophies() {
    const md = read('Доп колоды/Трофеи навыков.md');
    const keys = [['Навык сражения 5-го уровня', 'combat'], ['Навык защиты 5-го уровня', 'defense'], ['Навык алхимии 5-го уровня', 'alchemy'], ['Специализация 5-го уровня', 'spec']];
    return keys.map(([title, skill]) => {
        const i = md.indexOf('## ' + title);
        if (i < 0) fail('skill trophy ' + title);
        const body = md.slice(i, md.indexOf('\n## ', i + 4));
        const t = /\n(\*\*(?:В течение всей битвы|Один раз за битву):\*\*[^\n]+)/.exec(body);
        if (!t) fail('skill trophy text ' + title);
        return { id: 'SKILL-' + skill.toUpperCase(), skill, title, text: t[1].replace(/\*\*/g, '').trim(), copies: 2 };
    });
}
function importWitcherTrophies() {
    const md = read('Ведьмаки/Трофеи.md');
    const map = { 'Школа Волка': 'wolf', 'Школа Кота': 'cat', 'Школа Медведя': 'bear', 'Школа Змеи': 'viper', 'Школа Грифона': 'griffin', 'Школа Мантикоры': 'manticore', 'Цири': 'ciri' };
    const out = {};
    for (const [title, school] of Object.entries(map)) {
        const i = md.indexOf('## ' + title);
        if (i < 0) fail('witcher trophy ' + title);
        const m = /\*\*Эффект каждой из четырёх карт:\*\*\s*([^\n]+)/.exec(md.slice(i));
        if (!m) fail('witcher trophy text ' + title);
        out[school] = m[1].trim();
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------------------------
function importBoard() {
    const md = read('Прочее/Игровой стол.md');
    const locs = [];
    for (const line of md.split('\n')) {
        const m = /^\| <a id="loc-(\d\d)"><\/a>(\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line);
        if (!m) continue;
        const terrainText = m[4].trim();
        const terrain = terrainText.startsWith('Джокер') ? 'joker' : (TERRAIN[terrainText] || fail('board terrain ' + terrainText));
        const sp = m[5].trim();
        const schoolMap = { 'Мантикора': 'manticore', 'Грифон': 'griffin', 'Волк': 'wolf', 'Медведь': 'bear', 'Змея': 'viper', 'Кот': 'cat' };
        const school = Object.entries(schoolMap).find(([k]) => sp.startsWith(k));
        locs.push({
            n: Number(m[2]), name: m[3].trim(), terrain, school: school ? school[1] : null,
            port: /(^|; )порт|^Порт|якорь/.test(sp) && !/не порт/.test(sp), island: sp.startsWith('Остров'),
            actionText: m[6].trim(),
        });
    }
    const adj = {};
    const ai = md.indexOf('| № | Локация | Смежные номера |');
    for (const line of md.slice(ai).split('\n').slice(2)) {
        if (!line.startsWith('|')) break;
        const c = cells(line);
        adj[Number(c[0])] = c[2].split(',').map(s => Number(s.trim()));
    }
    if (locs.length !== 22) fail('expected 22 locations, got ' + locs.length);
    return { locs, adj };
}

// ---------------------------------------------------------------------------------------------
export function buildData() {
    const starter = importStarter();
    const common = importCommon();
    const data = {
        starter, common,
        monsters: importMonsters(),
        attacks: importAttacks(),
        potions: importPotions(),
        skillTrophies: importSkillTrophies(),
        witcherTrophies: importWitcherTrophies(),
        board: importBoard(),
        bigCards: importBigCards(),
        legends: importLegends(),
        legAttacks: importLegAttacks(),
        legMoves: importLegMoves(),
        ruins: importRuins(),
    };
    if (starter.length !== 70) fail('expected 70 starter cards, got ' + starter.length);
    if (common.length !== 90) fail('expected 90 common cards, got ' + common.length);
    if (data.attacks.length !== 20) fail('expected 20 monster attack cards');
    if (data.monsters.length !== 31) fail('expected 31 monsters');
    return data;
}

/** «По следу монстра», уязвимости: large monster cards (discard ability, special attacks I–IV)
 *  and their backs (vulnerabilities I–VI). Keyed by the small card id (the large atlas order differs). */
const BIG_OF = { 13: 'MON-15', 15: 'MON-13', 23: 'MON-24', 24: 'MON-23', 25: 'MON-26', 26: 'MON-25', 29: 'MON-30' };
function importBigCards() {
    const face = read('Монстры/Большие карты монстров.md'), back = read('Монстры/Уязвимости.md');
    const out = [];
    const clean = (s) => stripAnchor(s).replace(/\s+/g, ' ').trim();
    for (const part of face.split(/\n## MON-LARGE-/).slice(1)) {
        const nn = Number(part.slice(0, 2));
        const name = part.split('\n')[0].replace(/^\d+ — /, '').trim();
        const cell = (/\*\*Ячейка:\*\* `(r\d+c\d+)`/.exec(part) || fail('big cell ' + nn))[1];
        const sec = {};
        for (const s of part.split(/\n### /).slice(1)) { const [h, ...b] = s.split('\n'); sec[h.trim()] = clean(b.join('\n').split(/\n## /)[0]); }
        const discKey = Object.keys(sec).find(k => k.startsWith('Способность сброса')) || fail('discard ' + name);
        const attacks = ['I', 'II', 'III', 'IV'].map(r => { const k = Object.keys(sec).find(x => x.startsWith('Особая атака ' + r + ' ')) || fail('attack ' + r + ' ' + name); return { name: k.split(' — ')[1], text: sec[k].replace(/ ## Контроль[\s\S]*$/, '') }; });
        const vpart = back.split(/\n## MON-VULN-/).find(x => x.startsWith(String(nn).padStart(2, '0') + ' ')) || fail('vuln ' + name);
        const vulns = vpart.split(/\n### /).slice(1, 7).map(s => clean((/\*\*Игровой текст:\*\*([\s\S]*?)(\n\n|$)/.exec(s) || fail('vuln text ' + name))[1]));
        if (vulns.length !== 6) fail('6 vulns for ' + name);
        out.push({ id: BIG_OF[nn] || 'MON-' + String(nn).padStart(2, '0'), name, cell, discard: { name: discKey.split(' — ')[1], text: sec[discKey] }, attacks, vulns });
    }
    if (out.length !== 29) fail('expected 29 large monster cards, got ' + out.length);
    return out;
}

// ---------------------------------------------------------------------------------------------
// «Легендарная охота» (Книги правил/Легендарная охота.md; Легендарные монстры/*.md): 8 large cards
// (Кейран — «Набор монстров»), 20 combat cards, 12 movement cards, 24 ruin tokens.
// ---------------------------------------------------------------------------------------------
const LEGEND_KEY = { golem: 'golem', cyclops: 'cyclops', toad: 'toad', fiend: 'fiend', unseen: 'unseen', 'ice-giant': 'icegiant', gaunter: 'gaunter', kayran: 'kayran' };
function importLegends() {
    const md = read('Легендарные монстры/Легендарные монстры.md');
    const out = [];
    const clean = (s) => s.replace(/\s+/g, ' ').trim();
    for (const line of md.split('\n')) {
        const m = /^\| \[([^\]]+)\]\(#([a-z-]+)\) \| (r\dc\d) \| (\d+) \| \[[^\]]+\]\(<?([^)>]+)>?\) \|$/.exec(line);
        if (!m) continue;
        out.push({ id: 'LEG-' + LEGEND_KEY[m[2]].toUpperCase(), key: LEGEND_KEY[m[2]], name: m[1], cell: m[3], start: Number(m[4]), model: decodeURI(m[5]) });
    }
    for (const L of out) {
        const anchor = Object.keys(LEGEND_KEY).find(k => LEGEND_KEY[k] === L.key);
        const body = (md.split(`<a id="${anchor}"></a>`)[1] || fail('legend section ' + L.name)).split(/\n<a id=|\n## Важные/)[0];
        const ab = /\n\*\*(В течение всей битвы|В первый ход легендарного монстра|В начале первого хода легендарного монстра)(:?)\*\*:?\s*([^\n]+)/.exec(body) || fail('legend ability ' + L.name);
        L.ability = clean(ab[1] + (ab[2] ? ': ' : ' ') + ab[3]).replace(/^(В течение всей битвы): ?/, '$1: ');
        L.attacks = body.split(/\n### /).slice(1).map(part => {
            const [h, ...b] = part.split('\n');
            const text = clean(b.join('\n').replace(/\| Номер локации[\s\S]*$|\| Местность[\s\S]*$/, ''));
            return { name: h.replace(/^[IV]+ — /, '').trim(), text };
        });
        // Damage tables of Гюнтер III / Кейран III.
        const tbl = [...body.matchAll(/^\| ([^|]+) \| (\d+) \|$/gm)].filter(x => !/---/.test(x[1])).map(x => [x[1].trim(), Number(x[2])]);
        if (tbl.length) L.table = tbl;
        if (L.attacks.length !== 4) fail('4 attacks for ' + L.name);
    }
    if (out.length !== 8) fail('expected 8 legendary monsters, got ' + out.length);
    return out;
}
function parseLegAttack(t, id) {
    let m;
    if ((m = /^Урон (\d)$/.exec(t))) return { k: 'dmg', n: Number(m[1]) };
    if ((m = /^Сброс (\d)$/.exec(t))) return { k: 'deckTop', n: Number(m[1]), orHand: 'any' };
    if ((m = /^Особая (I|II|III|IV)$/.exec(t))) return { k: 'special', n: ['I', 'II', 'III', 'IV'].indexOf(m[1]) + 1 };
    return fail(`unknown legendary attack "${t}" in ${id}`);
}
function importLegAttacks() {
    const md = read('Легендарные монстры/Атаки.md');
    const out = [];
    for (const line of md.split('\n')) {
        if (!line.startsWith('| <a id="lm-atk-')) continue;
        const c = cells(line);
        const id = stripAnchor(c[0]);
        out.push({ id, cell: c[1], strike: parseLegAttack(c[2], id), bite: parseLegAttack(c[3], id), strikeText: c[2], biteText: c[3] });
    }
    if (out.length !== 20) fail('expected 20 legendary combat cards');
    return out;
}
function importLegMoves() {
    const md = read('Легендарные монстры/Движение.md');
    const out = [];
    for (const line of md.split('\n')) {
        if (!line.startsWith('| <a id="lm-move-')) continue;
        const c = cells(line);
        out.push({ id: stripAnchor(c[0]), cell: c[1], main: Number(c[2]), second: Number(c[3]), pts: c.slice(4, 9).map(Number) });
    }
    if (out.length !== 12 || out.some(x => x.pts.length !== 5 || x.pts.some(isNaN))) fail('expected 12 legendary movement cards');
    return out;
}
const RUIN_FX = {
    '[ЭЛИКСИР:+2]': { elixir: 2 },
    '[ЭЛИКСИР:+1]; [ФАЗА-III:ДОБОР:+1]': { elixir: 1, draw3: 1 },
    '[ЗОЛОТО:+2]': { gold: 2 },
    '[ЗОЛОТО:+1]; [ФАЗА-III:ДОБОР:+1]': { gold: 1, draw3: 1 },
    '[ЩИТ:−1]; [ФАЗА-III:ДОБОР:+2]': { shieldDown: 1, draw3: 2 },
    '[КАРТА-В-СБРОС:СТОИМОСТЬ-0]; [ФАЗА-III:ДОБОР:−1]': { zeroCard: true, draw3: -1 },
    '[СРАЖЕНИЕ:+1]; [ФАЗА-III:ДОБОР:−1]': { skill: 'combat', draw3: -1 },
    '[ЗАЩИТА:+1]; [ФАЗА-III:ДОБОР:−1]': { skill: 'defense', draw3: -1 },
    '[АЛХИМИЯ:+1]; [ФАЗА-III:ДОБОР:−1]': { skill: 'alchemy', draw3: -1 },
    '[СПЕЦИАЛИЗАЦИЯ:+1]; [ФАЗА-III:ДОБОР:−1]': { skill: 'spec', draw3: -1 },
    '[ЩИТ:=0]; [ЛЮБОЙ-НАВЫК:+1]': { shield0: true, skill: 'any' },
};
function importRuins() {
    const md = read('Легендарные монстры/Руины.md');
    const out = [];
    for (const line of md.split('\n')) {
        if (!line.startsWith('| <a id="ruin-')) continue;
        const c = cells(line);
        const id = stripAnchor(c[0]);
        const icons = c[2].replace(/`/g, '');
        const fx = RUIN_FX[icons] || fail(`unknown ruin bonus ${icons} (${id})`);
        const file = (/\(<([^>]+)>\)/.exec(c[1]) || fail('ruin file ' + id))[1];
        out.push({ id, file, fx, text: c[3] });
    }
    if (out.length !== 24) fail('expected 24 ruin tokens');
    return out;
}

export function render(data) {
    const head = '// GENERATED by witcher/tools/import.mjs from Witcher/*.md — do not edit by hand.\n' +
        '// Fix the Markdown transcription, then run: node witcher/tools/import.mjs\n';
    const body = Object.entries(data).map(([k, v]) => `export const ${k.toUpperCase()} = ${JSON.stringify(v)};\n`).join('');
    return head + body;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
    const text = render(buildData());
    if (process.argv.includes('--check')) {
        const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
        if (cur !== text) { console.error('gen-data.mjs is stale: run node witcher/tools/import.mjs'); process.exit(1); }
        console.log('gen-data.mjs up to date');
    } else {
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, text);
        console.log('wrote', path.relative(REPO, OUT), text.length, 'bytes');
    }
}
