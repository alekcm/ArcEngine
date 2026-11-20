// ============================================================================
//  Witcher: Old World — «Чародеи» data generator
// ----------------------------------------------------------------------------
//  Reads Witcher/Маги/*.md (Общие действия, Начальные колоды, Планшеты, Трофеи) and writes
//  witcher/shared/data/mages-data.mjs. The generated file is never edited by hand.
//
//    node witcher/tools/mages-gen.mjs          write mages-data.mjs
//    node witcher/tools/mages-gen.mjs --check  fail if mages-data.mjs is stale
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'Witcher', 'Маги');
const OUT = path.join(HERE, '..', 'shared', 'data', 'mages-data.mjs');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const cells = (line) => line.split('|').slice(1, -1).map(s => s.trim());
const stripAnchor = (s) => s.replace(/<a id="[^"]*"><\/a>/g, '').trim();
const fail = (msg) => { throw new Error('mages-gen: ' + msg); };

const COLOR = { 'Синий': 'blue', 'Красный': 'red', 'Зелёный': 'green', 'Фиолетовый': 'purple', 'Жёлтый': 'yellow' };
const LINK_COLOR = {
    'С': 'blue', 'К': 'red', 'З': 'green', 'Ф': 'purple', 'Ж': 'yellow',
    'Синяя': 'blue', 'Красная': 'red', 'Зелёная': 'green', 'Фиолетовая': 'purple', 'Жёлтая': 'yellow',
};
const TERRAIN = { 'Горы': 'mountain', 'Лес': 'forest', 'Вода': 'water', 'Джокер': 'joker' };
/** Mages in the order of the boards (Планшеты.md) with the row of the starting atlas. */
const MAGE_NAMES = { 'Альзур': 'alzur', 'Ардея': 'ardea', 'Гехира': 'gehira', 'Отар': 'otar', 'Филиппа': 'philippa' };

/** One printed effect field («У1; Б2», «Верх сброса», «Э−1 → У2» is handled by extraOf). */
function fxOf(s, where) {
    const fx = {};
    if (s === 'Нет' || s === 'без бонуса') return fx;
    for (const raw of s.split(';').map(x => x.trim()).filter(Boolean)) {
        const t = raw.toLowerCase();
        let m;
        if ((m = /^у(\d)$/.exec(t))) fx.dmg = (fx.dmg || 0) + Number(m[1]);
        else if ((m = /^б(\d)$/.exec(t))) fx.barrier = (fx.barrier || 0) + Number(m[1]);
        else if ((m = /^э(\d)$/.exec(t))) fx.energy = (fx.energy || 0) + Number(m[1]);
        else if ((m = /^д\+(\d)$/.exec(t))) fx.draw = (fx.draw || 0) + Number(m[1]);
        else if (t === 'б:э') fx.barrierE = true;
        else if (t === 'у:э') fx.dmgE = true;
        else if (t === 'д+э') fx.drawE = true;
        else if (t === 'верх сброса') fx.top = 1;
        else if (t === 'любая из сброса') fx.anyDiscard = 1;
        else if (t === 'вернуть эту') fx.ret = true;
        else if (t === 'любой цвет') fx.anyLink = true;
        else fail(`${where}: неизвестный значок «${raw}»`);
    }
    return fx;
}
/** «Э−2 → У3» → { cost: 2, fx }. */
function extraOf(s, where) {
    if (s === 'Нет') return null;
    const m = /^Э[−-](\d) → (.+)$/.exec(s);
    if (!m) fail(`${where}: доплата «${s}»`);
    return { cost: Number(m[1]), fx: fxOf(m[2], where) };
}
function linksOf(s, where) {
    if (s === 'Нет') return [];
    return s.split(';').map(x => x.trim()).filter(Boolean).map(part => {
        const m = /^(\S+) — (.+)$/.exec(part);
        if (!m || !LINK_COLOR[m[1]]) fail(`${where}: связь «${part}»`);
        return { color: LINK_COLOR[m[1]], fx: fxOf(m[2], where) };
    });
}
const rowsOf = (text) => text.split('\n').filter(l => l.startsWith('| <a id="m-'));

// ---- 90 common mage actions ----------------------------------------------------------------
const COMMON = rowsOf(read('Общие действия.md')).map(l => {
    const c = cells(l);
    if (c.length !== 9) fail('Общие действия: ' + l);
    const id = stripAnchor(c[0]);
    const color = COLOR[c[3]], terrain = TERRAIN[c[4]];
    if (!color || !terrain) fail(id + ': цвет/местность');
    return { id, cell: c[1], name: c[2], color, terrain, cost: Number(c[5]), fx: fxOf(c[6], id), extra: extraOf(c[7], id), links: linksOf(c[8], id), mageCard: true, printed: true };
});
if (COMMON.length !== 90) fail(`общих карт ${COMMON.length}, нужно 90`);

// ---- 50 starting cards, 10 per mage --------------------------------------------------------
const startText = read('Начальные колоды.md');
const START = [];
let curMage = null;
for (const l of startText.split('\n')) {
    const h = /^## (\S+) — строка (\d)/.exec(l);
    if (h) { curMage = MAGE_NAMES[h[1]] || fail('владелец строки ' + h[1]); continue; }
    if (!l.startsWith('| <a id="m-')) continue;
    const c = cells(l);
    if (c.length !== 8) fail('Начальные колоды: ' + l);
    const id = stripAnchor(c[0]);
    const color = COLOR[c[3]], terrain = TERRAIN[c[4]];
    if (!color || !terrain) fail(id + ': цвет/местность');
    START.push({ id, cell: c[1], name: c[2], color, terrain, cost: 0, fx: fxOf(c[5], id), extra: extraOf(c[6], id), links: linksOf(c[7], id), mage: curMage, starter: true, mageCard: true, printed: true });
}
if (START.length !== 50) fail(`начальных карт ${START.length}, нужно 50`);

// ---- 5 personal cards («уникальные действия», part «Уникальные действия» of «По следу монстра») --
// The special text is enforced by the engine under the key below (fight.mjs mageChain / spec).
const num = (s) => Number(s.replace('−', '-').replace('+', ''));
const UNIQUE_SPECIAL = { 'MAGE-UNIQUE-01': 'noSpent', 'MAGE-UNIQUE-02': 'philLink', 'MAGE-UNIQUE-03': 'burst', 'MAGE-UNIQUE-04': 'drain', 'MAGE-UNIQUE-05': 'trance' };
const UCOLOR = { 'красный': 'red', 'синий': 'blue', 'зелёный': 'green', 'фиолетовый': 'purple', 'жёлтый': 'yellow' };
const UTERRAIN = { 'вода': 'water', 'лес': 'forest', 'горы': 'mountain' };
const ULINK = { 'красная': 'red', 'синяя': 'blue', 'зелёная': 'green', 'фиолетовая': 'purple', 'жёлтая': 'yellow' };
function iconsOf(s, where) {
    const fx = {};
    for (const m of s.matchAll(/`\[([^\]]+)\]`/g)) {
        const [k, v] = m[1].split(':');
        if (k === 'УРОН') fx.dmg = (fx.dmg || 0) + num(v);
        else if (k === 'БАРЬЕР') fx.barrier = (fx.barrier || 0) + num(v);
        else if (k === 'ЭНЕРГИЯ') fx.energy = (fx.energy || 0) + num(v);
        else if (k === 'ДОБОР') fx.draw = (fx.draw || 0) + num(v);
        else if (k === 'ВЗЯТЬ-ИЗ-СБРОСА' && v === 'ВЕРХНЮЮ') fx.top = 1;
        else fail(`${where}: значок «${m[1]}»`);
    }
    return fx;
}
const UNIQUES = read('Уникальные карты.md').split('\n## ').slice(1).filter(s => s.startsWith('MAGE-UNIQUE')).map(sec => {
    const id = /^(MAGE-UNIQUE-\d\d) — (.+)$/m.exec(sec) || fail('уникальная карта: заголовок');
    const field = (name) => (new RegExp(`\\*\\*${name}:\\*\\* (.+)$`, 'm').exec(sec) || fail(`${id[1]}: ${name}`))[1].trim();
    const mage = MAGE_NAMES[/^(\S+)/.exec(field('Персонаж'))[1].replace(/[.,]$/, '')] || fail(id[1] + ': персонаж');
    const color = UCOLOR[/^(\S+)/.exec(field('Цвет'))[1]] || fail(id[1] + ': цвет');
    const terrain = UTERRAIN[field('Местность').replace(/\.$/, '')] || fail(id[1] + ': местность');
    const lk = field('Связи');
    const links = /^нет напечатанных связей/.test(lk) ? [] : lk.replace(/\.$/, '').split(';').map(x => x.trim()).map(part => {
        const m = /^(\S+) — (.+)$/.exec(part);
        if (!m || !ULINK[m[1]]) fail(`${id[1]}: связь «${part}»`);
        return { color: ULINK[m[1]], fx: m[2] === 'без значка' ? {} : iconsOf(m[2], id[1]) };
    });
    return {
        id: id[1], cell: (/`(r\dc\d)`/.exec(field('Ячейка')) || fail(id[1] + ': ячейка'))[1], name: id[2].trim(), color, terrain,
        cost: Number(field('Стоимость').replace(/\.$/, '')), fx: iconsOf(field('Основные значки'), id[1]), links,
        // «Взрыв силы»: an optional extra like the printed ones — the whole energy (at least 3) → 3 damage.
        extra: UNIQUE_SPECIAL[id[1]] === 'burst' ? { cost: 3, all: true, fx: { dmg: 3 } } : null,
        mage, special: UNIQUE_SPECIAL[id[1]] || fail(id[1] + ': нет обработчика'), text: field('Особый эффект'), unique: true, mageCard: true, printed: 'U',
    };
});
if (UNIQUES.length !== 5) fail(`уникальных карт ${UNIQUES.length}, нужно 5`);

// ---- boards: specialization tables ---------------------------------------------------------
const boards = read('Планшеты.md');
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
/** The I..V table under the «### <spec>» header of a mage section. */
function specTable(section, cols) {
    const rows = section.split('\n').filter(l => /^\| (I|II|III|IV|V) \|/.test(l)).map(cells);
    if (rows.length !== 5 || rows.some((r, i) => r[0] !== ROMAN[i])) fail('таблица специализации');
    return rows.map(r => cols.map(k => num(r[k])));
}
const sectionOf = (anchor) => {
    const i = boards.indexOf(`<a id="${anchor}"></a>`);
    if (i < 0) fail('нет раздела ' + anchor);
    const j = boards.indexOf('<a id="', i + 10);
    return boards.slice(i, j < 0 ? undefined : j);
};
const headerSpec = (sec) => (/^### (.+)$/m.exec(sec) || fail('нет названия специализации'))[1].trim();
const MAGES = {};
const DEF = [
    // id, anchor, hero, board colour (Планшеты.md: «Цвет оформления»), table columns
    ['alzur', 'alzur', 'Альзур', '#3c6fb4', [1], 'Чародей'],
    ['ardea', 'ardea', 'Ардея', '#c04f8e', [1, 2], 'Чародейка'],
    ['gehira', 'gekhira', 'Гехира', '#4a3a30', [2, 3], 'Чародейка'],
    ['otar', 'otar', 'Отар', '#7a4fb0', [1, 2], 'Чародей'],
    ['philippa', 'philippa', 'Филиппа', '#2f9e9a', [1], 'Чародейка'],
];
for (const [id, anchor, hero, color, cols, title] of DEF) {
    const sec = sectionOf(anchor);
    if (!sec.includes(hero)) fail('раздел ' + anchor + ' без имени ' + hero);
    const spec = headerSpec(sec);
    const text = (/\*\*Напечатанный текст:\*\* (.+)$/m.exec(sec) || fail('текст специализации ' + id))[1].trim();
    MAGES[id] = { id, hero, title, color, spec, specText: text, table: specTable(sec, cols) };
}
// Филиппа: the four forms (1+ Кошка … 5+ Сова) are fixed by the printed text.
for (const id of Object.keys(MAGES)) if (!START.some(c => c.mage === id)) fail('нет стартовой колоды ' + id);

// ---- trophies for defeating a mage ---------------------------------------------------------
const trText = read('Трофеи.md');
const TROPHIES = [];
const TROPHY_TEXT = {};
for (const [id, anchor] of DEF.map(d => [d[0], d[1] === 'gekhira' ? 'gekhira' : d[1]])) {
    const i = trText.indexOf(`<a id="${anchor}"></a>`);
    if (i < 0) fail('трофей ' + anchor);
    const j = trText.indexOf('\n## ', trText.indexOf('\n## ', i) + 4);
    const sec = trText.slice(i, j < 0 ? undefined : j);
    // The effect: «**Эффект каждой из четырёх карт:** …» (one line, or a list under it).
    const k = sec.indexOf('**Эффект каждой из четырёх карт:**');
    if (k < 0) fail('эффект трофея ' + id);
    const tail = sec.slice(k + '**Эффект каждой из четырёх карт:**'.length).split('\n| ID')[0];
    TROPHY_TEXT[id] = tail.split('\n').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\*\*/g, '')).join('\n');
    for (const row of sec.split('\n').filter(l => /^\| <a id="mage-trophy-/.test(l))) {
        const c = cells(row);
        TROPHIES.push({ id: stripAnchor(c[0]), cell: c[1], mage: id, flavor: c[2] });
    }
}
if (TROPHIES.length !== 20) fail(`трофеев ${TROPHIES.length}, нужно 20`);

// ---- Кащей (Набор монстров, for «Чародеи»): the large card, Монстры/Кащей.md ---------------
const kText = fs.readFileSync(path.join(SRC, '..', 'Монстры', 'Кащей.md'), 'utf8');
const kSec = (head) => {
    const i = kText.indexOf(head);
    if (i < 0) fail('Кащей: ' + head);
    const rest = kText.slice(i + head.length);
    const j = rest.search(/\n#{2,3} /);
    return (j < 0 ? rest : rest.slice(0, j)).trim();
};
const kDiscard = /^### Способность сброса — (.+)$/m.exec(kText) || fail('Кащей: способность сброса');
const KOSHCHEI_BIG = {
    id: 'MON-29', name: 'Кащей',
    discard: { name: kDiscard[1].trim(), text: kSec(kDiscard[0]) },
    attacks: ['I', 'II', 'III', 'IV'].map(n => {
        const m = new RegExp(`^### Особая атака ${n} — (.+)$`, 'm').exec(kText) || fail('Кащей: атака ' + n);
        return { name: m[1].trim(), text: kSec(m[0]) };
    }),
    // Vulnerabilities I and V (and IV) print separate effects for mages and witchers: both kept.
    vulns: ['I', 'II', 'III', 'IV', 'V', 'VI'].map(n => kSec(`### ${n}\n`).split('\n').map(l => l.trim()).filter(l => l && !/^\*\*Художественный текст/.test(l) && !/^<a id=/.test(l)).join('\n').replace(/\*\*/g, '')),
};
for (const v of KOSHCHEI_BIG.vulns) if (v.length < 20) fail('Кащей: уязвимость ' + v);

const out = `// GENERATED by witcher/tools/mages-gen.mjs from Witcher/Маги/*.md — do not edit by hand.
// «Чародеи»: 90 common mage actions (M-A/M-B), 50 starting cards (M-START, 10 per mage),
// the five boards (specialization tables I..V), the 20 trophies for defeating a mage and the
// large card of Кащей (Монстры/Кащей.md, «Набор монстров»).
// fx: dmg, barrier, energy, draw (end of the fight turn), top (top of the discard), anyDiscard,
// ret (return this card), dmgE / barrierE / drawE (= current energy), anyLink (a link of any colour).
// extra: { cost (energy), fx } — the optional additional effect of the card.
// MAGE_UNIQUES: the 5 personal cards (11th starting card with «Уникальные действия»); special —
// the key of the engine rule for «Особый эффект».

export const MAGE_COMMON = ${JSON.stringify(COMMON)};
export const MAGE_START = ${JSON.stringify(START)};
export const MAGE_UNIQUES = ${JSON.stringify(UNIQUES)};
export const MAGES = ${JSON.stringify(MAGES)};
export const MAGE_TROPHIES = ${JSON.stringify(TROPHIES)};
export const MAGE_TROPHY_TEXT = ${JSON.stringify(TROPHY_TEXT)};
export const KOSHCHEI_BIG = ${JSON.stringify(KOSHCHEI_BIG)};
`;
if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== out) { console.error('mages-data.mjs устарел: node witcher/tools/mages-gen.mjs'); process.exit(1); }
    console.log('mages-data.mjs актуален');
} else {
    fs.writeFileSync(OUT, out);
    console.log(`mages-data.mjs: ${COMMON.length} общих, ${START.length} начальных, ${Object.keys(MAGES).length} планшетов, ${TROPHIES.length} трофеев`);
}
