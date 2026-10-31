// ============================================================================
//  Forbidden Stars — importer: docs/forbidden-stars/*.md -> js/fs/FSData.js
// ----------------------------------------------------------------------------
//  The text transcription in docs/forbidden-stars is the single source of truth
//  for the board game data (factions, system tiles, combat cards, order upgrades,
//  event cards). This script parses those markdown files and writes the game
//  data as a plain JS file — no build step in the game itself, the file is
//  committed and loaded by a <script> tag.
//
//      node tools/fs-import.mjs            parse and write js/fs/FSData.js
//      node tools/fs-import.mjs --check    parse and compare (exit 1 on drift)
//
//  What is parsed:
//      02-factions.md   12 factions: units (КЛ/цена/бой/прочность/мораль/тип/старт),
//                       initial structures and tokens, the faction ability
//      03-systems.md    40 system tiles: worlds (name, materiel, capacity, asset
//                       icons), voids, and the two objective token spaces per tile
//      04-combat-cards.md  combat deck cards (5 base per faction) and combat
//                       upgrade cards (icons, command level, cost, ability texts)
//      05-order-upgrades.md  order upgrade cards
//      06-events.md     event cards (tactic/scheme, warp storm directions, text)
//
//  The markdown is written by hand, so the parser is deliberately forgiving:
//  it skips rows it does not understand and reports what it skipped.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs', 'forbidden-stars');
const OUT = path.join(ROOT, 'js', 'fs', 'FSData.js');

const warnings = [];
const warn = msg => warnings.push(msg);

// ---------------------------------------------------------------------------
//  Markdown helpers
// ---------------------------------------------------------------------------

// Split a table row into cells. A pipe inside a code span (`a | b`) is not a
// separator — the docs use `att. icon` style code spans heavily.
function cells(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    const out = [];
    let cur = '', inCode = false;
    for (const ch of s) {
        if (ch === '`') inCode = !inCode;
        if (ch === '|' && !inCode) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur.trim());
    return out;
}

// Is this line a table row (and not a separator like |---|---|)?
function isRow(line) {
    const t = line.trim();
    if (!t.startsWith('|')) return false;
    const c = cells(t);
    return c.length > 1 && !c.every(x => /^:?-{2,}:?$/.test(x));
}

// Plain text of a cell: markdown emphasis and code ticks removed, spaces kept.
function plain(text) {
    return String(text == null ? '' : text)
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// Text of a cell with the code spans kept as `...` (the card texts are shown
// to the player with the icon names in backticks).
function rich(text) {
    return String(text == null ? '' : text)
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// The name of a card row: **Name** -> Name, with the " (other edition)" tail
// kept (the docs list two editions of some cards separately).
function cardName(raw) {
    return plain(raw).replace(/\s*\*\(другая редакция\)\*$/, '');
}

// Split a document into sections by markdown headings.
function sections(md) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let cur = null;
    for (const line of lines) {
        const h = /^(#{1,4})\s+(.*)$/.exec(line);
        if (h) {
            cur = { level: h[1].length, title: plain(h[2]), lines: [] };
            out.push(cur);
            continue;
        }
        if (cur) cur.lines.push(line);
    }
    return out;
}

// Every table of a section: { header: string[], rows: string[][] }.
function tables(lines) {
    const out = [];
    let header = null;
    let rows = null;
    for (const line of lines) {
        if (!line.trim().startsWith('|')) { header = null; rows = null; continue; }
        const c = cells(line);
        // The |---|---| separator belongs to the table — it does not end it.
        if (c.every(x => /^:?-{2,}:?$/.test(x))) continue;
        if (!header) { header = c; rows = []; out.push({ header, rows }); continue; }
        rows.push(c);
    }
    return out.filter(t => t.rows.length);
}

// The rows of the first table whose header contains all of the given names.
function tableByHeader(lines, ...names) {
    for (const t of tables(lines)) {
        const head = t.header.map(plain);
        if (names.every(n => head.some(h => h.includes(n)))) return t;
    }
    return null;
}

// Two header rows are the same when their cells match.
function sameHeader(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (plain(a[i]) !== plain(b[i])) return false;
    return true;
}

// Index of a column by its header text (first match).
function col(header, name) {
    const i = header.findIndex(h => h.includes(name));
    return i < 0 ? -1 : i;
}

// Merge conflict markers left in the transcription: keep the first (HEAD)
// side by default, the second side for the sections listed in PREFER_SECOND.
const PREFER_SECOND = ['Сестры битвы — 2 карты'];
function resolveConflicts(text, preferSecond) {
    const out = [];
    let block = null;
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('<<<<<<< ')) { block = { ours: [], theirs: [] }; continue; }
        if (block && line.startsWith('=======')) { block.inTheirs = true; continue; }
        if (block && line.startsWith('>>>>>>> ')) {
            const side = (preferSecond && block.theirs.length) ? block.theirs : block.ours;
            out.push(...side);
            block = null;
            continue;
        }
        if (block) (block.inTheirs ? block.theirs : block.ours).push(line);
        else out.push(line);
    }
    return out.join('\n');
}

// ---------------------------------------------------------------------------
//  02-factions.md
// ---------------------------------------------------------------------------

const FACTION_COLORS = {
    'имперская-гвардия': '#d8b23a', 'некроны': '#3f7d4e', 'тираниды': '#7a4fa3',
    'эльдары': '#2f7fd0', 'космодесант-хаоса': '#b03030', 'орки': '#6aa832',
    'космодесант': '#2a5fb0', 'империя-тау': '#c98a2b', 'инквизиция': '#8d1f2a',
    'темные-эльдары': '#2aa0a0', 'сестры-битвы': '#d8d2c4', 'адептус-механикус': '#9a3b2a',
};

// The faction sheet order (the order of the sections in 02-factions.md).
const FACTION_ORDER = [
    'имперская-гвардия', 'некроны', 'тираниды', 'эльдары', 'космодесант-хаоса', 'орки',
    'космодесант', 'империя-тау', 'инквизиция', 'темные-эльдары', 'сестры-битвы', 'адептус-механикус',
];

// The home system tile of a faction is named in the tile heading ("### Тайл 12A (Хаос)").
const HOME_FACTION = {
    'эльдары': 'эльдары', 'космодесант': 'космодесант', 'орки': 'орки',
    'хаос': 'космодесант-хаоса', 'некроны': 'некроны', 'тау': 'империя-тау',
    'тираниды': 'тираниды', 'имперская гвардия': 'имперская-гвардия',
};

const slug = s => s.toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function parseFactions(md) {
    const out = [];
    for (const sec of sections(md)) {
        if (sec.level !== 2) continue;
        const m = /^([^—]+?)\s+—\s+(.+)$/.exec(sec.title);
        if (!m) continue;
        const name = plain(m[1]);
        const key = slug(name);
        if (!FACTION_ORDER.includes(key)) continue;
        const body = sec.lines.join('\n');

        const t = tableByHeader(sec.lines, 'Отряд', 'КЛ', 'Стоимость', 'Бой');
        if (!t) { warn(`фракция ${name}: таблица отрядов не найдена`); continue; }
        const h = t.header.map(plain);
        const cKl = col(h, 'КЛ'), cCost = col(h, 'Стоимость'), cCombat = col(h, 'Бой'),
            cHealth = col(h, 'Прочн'), cMorale = col(h, 'Мор'), cType = col(h, 'Тип'),
            cStart = col(h, 'Нач'), cMax = col(h, 'Макс');

        const units = [];
        for (const row of t.rows) {
            const nameCell = plain(row[0]);
            if (!nameCell) continue;
            const cost = plain(row[cCost]);
            units.push({
                id: slug(nameCell),
                name: nameCell,
                kl: Number(row[cKl]) || 0,
                cost: Number.parseInt(cost, 10) || 0,
                forge: /⚙/.test(cost),
                combat: Number(row[cCombat]) || 0,
                health: Number(row[cHealth]) || 0,
                morale: Number(row[cMorale]) || 0,
                type: /корабл/i.test(row[cType]) ? 'ship' : 'ground',
                start: Number(row[cStart]) || 0,
                max: Number(row[cMax]) || 0,
            });
        }

        // "Прочее на старте: 1 фабрика." / "1 бастион, 1 фабрика, 1 жетон подкрепления."
        const extra = /Прочее на старте:\s*([^\n]+)/.exec(body);
        const start = { factory: 0, city: 0, bastion: 0, forge: 0, cache: 0, reinforcement: 0, prosperity: 0 };
        if (extra) {
            const txt = plain(extra[1]);
            const cnt = (re) => { const m = re.exec(txt); return m ? Number(m[1]) || 0 : 0; };
            start.factory = cnt(/(\d+)\s*фабрик/);
            start.city = cnt(/(\d+)\s*город/);
            start.bastion = cnt(/(\d+)\s*бастион/);
            start.forge = cnt(/(\d+)\s*жетон\w*\s*кузниц/);
            start.cache = cnt(/(\d+)\s*жетон\w*\s*тайник/);
            start.reinforcement = cnt(/(\d+)\s*жетон\w*\s*подкреплен/);
        }

        // The faction ability: **Особенность «Mass Production».** text
        const ab = /\*\*Особенность\s*«([^»]+)»\.\*\*\s*([\s\S]*?)(?:\n\n|$)/.exec(body);
        const ability = ab ? { name: plain(ab[1]), text: plain(ab[2]) } : { name: '', text: '' };

        out.push({
            id: key,
            name,
            full: plain(m[2]),
            color: FACTION_COLORS[key] || '#8899aa',
            units,
            start,
            ability,
        });
    }
    // Keep the sheet order of the document.
    out.sort((a, b) => FACTION_ORDER.indexOf(a.id) - FACTION_ORDER.indexOf(b.id));
    return out;
}

// ---------------------------------------------------------------------------
//  03-systems.md
// ---------------------------------------------------------------------------

const POS = { 'ПЛ': 'TL', 'ПП': 'TR', 'НЛ': 'BL', 'НП': 'BR' };
const POS_EN = { 'верх-лево': 'TL', 'верх-право': 'TR', 'низ-лево': 'BL', 'низ-право': 'BR' };

const ASSET_BY_WORD = {
    'кузница': 'forge', 'кузницу': 'forge', 'кузницы': 'forge',
    'тайник': 'cache', 'тайника': 'cache', 'тайники': 'cache',
    'подкрепление': 'reinforcement', 'подкрепления': 'reinforcement', 'подкреплений': 'reinforcement',
    'процветание': 'prosperity', 'процветания': 'prosperity',
};

// A world name with the note in brackets: "Xana II (world-forge)" -> "Xana II".
function cleanWorldName(name) {
    return plain(name).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*`?\?`?$/, '').trim();
}

function parseAssets(text) {
    const out = [];
    const t = plain(text);
    if (!t || t === '—') return out;
    // "тайник + кузница", "2× кузница", "подкрепление ×2", "кузница"
    const parts = t.split('+').map(s => s.trim());
    for (const part of parts) {
        const mul = /(\d+)\s*[×x]\s*/.exec(part);
        const n = mul ? Number(mul[1]) : (/×\s*(\d+)/.exec(part) ? Number(/×\s*(\d+)/.exec(part)[1]) : 1);
        const word = part.replace(/[\d×x\s]/g, '');
        const key = Object.keys(ASSET_BY_WORD).find(w => word.toLowerCase().startsWith(w));
        if (!key) { warn(`иконка ресурса не распознана: "${text}"`); continue; }
        for (let i = 0; i < (n || 1); i++) out.push(ASSET_BY_WORD[key]);
    }
    return out;
}

function parseSystems(md) {
    const tiles = new Map();
    const ensure = id => {
        if (!tiles.has(id)) tiles.set(id, { id, home: null, areas: [] });
        return tiles.get(id);
    };

    // --- the summary table of the base tiles: | Тайл | Мир | Поз. | Тип | M | Вм | Р |
    const base = tableByHeader(md.split(/\r?\n/), 'Тайл', 'Мир', 'Поз', 'Тип');
    if (base) {
        for (const row of base.rows) {
            const id = plain(row[0]);
            const world = plain(row[1]);
            const pos = plain(row[2]);
            if (!POS[pos]) { warn(`тайл ${id}: неизвестная позиция "${pos}"`); continue; }
            const tile = ensure(id);
            const materiel = plain(row[4]);
            const assets = parseAssets(row[6]);
            tile.areas.push({
                pos: POS[pos],
                world: {
                    name: cleanWorldName(world),
                    materiel: materiel === '—' ? 0 : Number(materiel) || 0,
                    capacity: Number(plain(row[5])) || 0,
                    assets,
                },
            });
        }
    }

    // --- the per-tile tables of the home and new tiles: | Мир | Поз. | M | Вм | Р |
    for (const sec of sections(md)) {
        const m = /^Тайл\s+([0-9]{1,2}[AB])\b/.exec(sec.title);
        if (!m) continue;
        const id = m[1];
        const tile = ensure(id);
        const t = tableByHeader(sec.lines, 'Мир', 'Поз', 'M');
        if (!t) continue;
        for (const row of t.rows) {
            const world = plain(row[0]);
            const pos = plain(row[1]);
            if (!POS[pos]) { warn(`тайл ${id}: неизвестная позиция "${pos}"`); continue; }
            const materiel = plain(row[2]);
            tile.areas.push({
                pos: POS[pos],
                world: {
                    name: cleanWorldName(world),
                    materiel: materiel === '—' ? 0 : Number(materiel) || 0,
                    capacity: Number(plain(row[3])) || 0,
                    assets: parseAssets(row[4]),
                },
            });
        }
        // The expansion tiles 17–20 carry faction icons too; their headings
        // identify the source image rather than naming the faction in brackets.
        const expansionHomes = { 17: 'темные-эльдары', 18: 'адептус-механикус', 19: 'сестры-битвы', 20: 'инквизиция' };
        if (expansionHomes[parseInt(id, 10)]) tile.home = expansionHomes[parseInt(id, 10)];
        // The home tile of a faction: "### Тайл 9A (Эльдары)"
        const f = /\(([^)]+)\)/.exec(sec.title);
        if (f) {
            const key = slug(plain(f[1]));
            tile.home = HOME_FACTION[key] || key;
        }
    }

    // --- the objective token spaces: | Тайл | Место 1 | Место 2 | Мир без места |
    const obj = tableByHeader(md.split(/\r?\n/), 'Тайл', 'Место 1', 'Место 2');
    if (obj) {
        for (const row of obj.rows) {
            const id = plain(row[0]);
            const tile = ensure(id);
            tile.objectiveSpaces = [];
            for (const cell of [row[1], row[2]]) {
                const t = plain(cell);
                if (!t || t === '—') continue;
                const mm = /^(ПЛ|ПП|НЛ|НП)\s*—\s*(.+)$/.exec(t);
                if (!mm) { warn(`тайл ${id}: место под жетон "${t}" не разобрано`); continue; }
                tile.objectiveSpaces.push({ pos: POS[mm[1]], name: mm[2].replace(/\s*`?\?`?$/, '').trim() });
            }
        }
    }

    // Fill the empty areas with voids and attach the objective spaces to worlds.
    const list = [...tiles.values()];
    for (const tile of list) {
        for (const pos of ['TL', 'TR', 'BL', 'BR']) {
            if (!tile.areas.some(a => a.pos === pos)) tile.areas.push({ pos, world: null });
        }
        tile.areas.sort((a, b) => ['TL', 'TR', 'BL', 'BR'].indexOf(a.pos) - ['TL', 'TR', 'BL', 'BR'].indexOf(b.pos));
        for (const space of tile.objectiveSpaces || []) {
            const area = tile.areas.find(a => a.pos === space.pos);
            if (area && area.world) area.world.objective = true;
        }
        if (!tile.objectiveSpaces) tile.objectiveSpaces = [];
    }
    list.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    return list;
}

// ---------------------------------------------------------------------------
//  04-combat-cards.md
// ---------------------------------------------------------------------------

// Count the combat icons of the left column: `att. icon`, `def. icon`, `morale icon`.
function parseIcons(cell) {
    const icons = { att: 0, def: 0, morale: 0 };
    const t = plain(cell);
    if (!t || t === '—' || /пустая колонка|колонка пустая/i.test(t)) return icons;
    for (const part of t.split(',')) {
        const p = plain(part);
        if (p === 'att. icon' || p === 'att' || p === 'наступление') icons.att++;
        else if (p === 'def. icon' || p === 'def' || p === 'оборона') icons.def++;
        else if (p === 'morale icon' || p === 'morale' || p === 'мораль') icons.morale++;
        else if (/icon/i.test(p)) warn(`иконка боя не распознана: "${p}"`);
    }
    return icons;
}

// The unit requisites of the brown ability box: "*Guardsman/Cruiser:* text".
function parseRequisites(text) {
    const t = plain(text);
    const m = /^([^:*]{1,120}):/.exec(t);
    if (!m) return [];
    return m[1].split('/').map(s => s.trim()).filter(Boolean);
}

function parseCombatCards(md) {
    const out = [];
    let faction = '';
    for (const sec of sections(md)) {
        if (sec.level === 1) {
            faction = slug(sec.title);
            if (!FACTION_ORDER.includes(faction)) faction = '';
        }
        if (!faction) continue;
        // The base deck table: header has "Иконки" and no "Стоимость".
        for (const t of tables(sec.lines)) {
            const h = t.header.map(plain);
            const hasIcons = col(h, 'Иконки') >= 0;
            const hasCost = col(h, 'Стоимость') >= 0;
            const iName = h.findIndex(x => x === 'Карта' || x === 'Название');
            if (!hasIcons || iName < 0) continue;
            const iKl = col(h, 'КЛ'), iCost = col(h, 'Стоимость'), iIcons = col(h, 'Иконки');
            const iGeneral = iIcons + 1;
            const iUnit = iGeneral + 1;
            for (const row of t.rows) {
                const name = cardName(row[iName]);
                if (!name) continue;
                const general = rich(row[iGeneral] || '');
                const unitText = rich(row[iUnit] || '');
                const unit = unitText && !/^—/.test(unitText) && !/плашки нет/i.test(unitText)
                    ? unitText : '';
                out.push({
                    faction,
                    name,
                    upgrade: hasCost,
                    kl: iKl >= 0 ? Number(row[iKl]) || 0 : 0,
                    cost: iCost >= 0 ? Number(row[iCost]) || 0 : 0,
                    icons: parseIcons(row[iIcons]),
                    general,
                    unit,
                    reqs: parseRequisites(unitText),
                });
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
//  05-order-upgrades.md
// ---------------------------------------------------------------------------

const ORDER_BY_ICON = [
    [/орбитальн/i, 'orbital'],
    [/продвижен|череп/i, 'advance'],
    [/развертыван|постройк/i, 'deploy'],
    [/планирован|стратег|развит/i, 'strategize'],
    [/доминирован|крыл/i, 'dominate'],
];

function parseOrderCards(md) {
    const out = [];
    const text = resolveConflicts(md, false);
    for (const sec of sections(text)) {
        if (sec.level !== 2 && sec.level !== 3) continue;
        const faction = slug(sec.title.split('—')[0]);
        if (!FACTION_ORDER.includes(faction)) continue;
        const t = tableByHeader(sec.lines, 'Карта', 'КЛ', 'Стоимость');
        if (!t) continue;
        const h = t.header.map(plain);
        const iName = h.findIndex(x => x === 'Карта'), iKl = col(h, 'КЛ'),
            iCost = col(h, 'Стоимость'), iIcon = col(h, 'Иконка приказа'), iText = h.length - 1;
        for (const row of t.rows) {
            const name = cardName(row[iName]);
            if (!name) continue;
            const icon = plain(row[iIcon]);
            const order = (ORDER_BY_ICON.find(([re]) => re.test(icon)) || [null, 'any'])[1];
            out.push({
                faction,
                name,
                kl: Number(row[iKl]) || 0,
                cost: Number(row[iCost]) || 0,
                order,
                icon,
                text: rich(row[iText] || ''),
            });
        }
    }
    // The Sisters' two cards are read from the new sheet — the second conflict side.
    const text2 = resolveConflicts(md, true);
    for (const sec of sections(text2)) {
        if (!PREFER_SECOND.some(p => sec.title.includes(p))) continue;
        const faction = slug(sec.title.split('—')[0]);
        if (!FACTION_ORDER.includes(faction)) continue;
        const t = tableByHeader(sec.lines, 'Карта', 'КЛ', 'Стоимость');
        if (!t) continue;
        const h = t.header.map(plain);
        const iName = h.findIndex(x => x === 'Карта'), iKl = col(h, 'КЛ'),
            iCost = col(h, 'Стоимость'), iIcon = col(h, 'Иконка приказа'), iText = h.length - 1;
        for (const row of t.rows) {
            const name = cardName(row[iName]);
            if (!name) continue;
            const icon = plain(row[iIcon]);
            const order = (ORDER_BY_ICON.find(([re]) => re.test(icon)) || [null, 'any'])[1];
            const idx = out.findIndex(o => o.faction === faction && o.name === name);
            const card = {
                faction, name,
                kl: Number(row[iKl]) || 0,
                cost: Number(row[iCost]) || 0,
                order,
                icon,
                text: rich(row[iText] || ''),
            };
            if (idx >= 0) out[idx] = card; else out.push(card);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
//  06-events.md
// ---------------------------------------------------------------------------

// The warp storm icon: a set of arrows. Each arrow is one of the eight
// directions (the transcription is not fully verified — see 00-verification.md).
const ARROW_DIR = {
    '⬆': 'N', '⬇': 'S', '⬅': 'W', '➡': 'E',
    '↩': 'NW', '↪': 'NE', '⮕': 'SE', '⮖': 'SW',
};

function parseStorm(text) {
    const dirs = [];
    for (const ch of String(text || '')) if (ARROW_DIR[ch] && !dirs.includes(ARROW_DIR[ch])) dirs.push(ARROW_DIR[ch]);
    if (!dirs.length) return ['any'];
    return dirs.slice(0, 2);
}

function parseEvents(md) {
    const out = [];
    for (const sec of sections(md)) {
        if (sec.level < 2) continue;
        const faction = slug(sec.title.replace(/\(.*?\)/g, '').split('—')[0]);
        if (!FACTION_ORDER.includes(faction)) continue;
        const t = tableByHeader(sec.lines, 'Карта', 'Тип');
        if (!t) continue;
        const h = t.header.map(plain);
        const iName = h.findIndex(x => x === 'Карта'), iType = col(h, 'Тип'), iText = h.length - 1;
        for (const row of t.rows) {
            const name = cardName(row[iName]);
            if (!name) continue;
            const typeCell = plain(row[iType]);
            const type = /ПЛАН/i.test(typeCell) ? 'scheme' : 'tactic';
            // The storm icon is written in the brackets of the card name or of the type cell.
            const stormCell = rich(row[iName] || '') + ' ' + rich(row[iType] || '');
            const clean = plain(name).replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
            out.push({
                faction,
                name: clean,
                type,
                storm: parseStorm(stormCell),
                // The notes of the transcription after the dash are not the
                // text of the card.
                text: rich(row[iText] || '').split(/\s+—\s+/)[0],
            });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
//  main
// ---------------------------------------------------------------------------

function build() {
    const read = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
    const factions = parseFactions(read('02-factions.md'));
    const tiles = parseSystems(read('03-systems.md'));
    const combat = parseCombatCards(read('04-combat-cards.md'));
    const orders = parseOrderCards(read('05-order-upgrades.md'));
    const events = parseEvents(read('06-events.md'));

    const data = { factions, tiles, combat, orders, events };
    return data;
}

function serialize(data) {
    const lines = [];
    lines.push('// FSData.js — GENERATED by tools/fs-import.mjs from docs/forbidden-stars/*.md.');
    lines.push('// Do not edit by hand: change the markdown transcription and run the importer again.');
    lines.push('//');
    lines.push('// factions — 12 sheets: units (command level, cost, combat, health, morale, type),');
    lines.push('//            initial forces, the faction ability.');
    lines.push('// tiles    — 40 system tiles: four areas (world or void) with materiel, capacity,');
    lines.push('//            asset icons and the objective token spaces.');
    lines.push('// combat   — combat deck cards (5 per faction) and combat upgrade cards.');
    lines.push('// orders   — order upgrade cards.');
    lines.push('// events   — event cards with their warp storm directions.');
    lines.push('/** @satisfies {Record<string, any>} */');
    lines.push('const FS_DATA = ' + JSON.stringify(data, null, 1) + ';');
    lines.push('');
    return lines.join('\n');
}

const data = build();
const text = serialize(data);

if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
        console.error('FSData.js устарел — запустите: node tools/fs-import.mjs');
        process.exit(1);
    }
} else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log('Записано: ' + path.relative(ROOT, OUT));
}

// A short report: what was parsed and what was skipped.
const worldCount = data.tiles.reduce((n, t) => n + t.areas.filter(a => a.world).length, 0);
const spaceCount = data.tiles.reduce((n, t) => n + t.areas.filter(a => a.world && a.world.objective).length, 0);
console.log(`  фракций: ${data.factions.length}, отрядов: ${data.factions.reduce((n, f) => n + f.units.length, 0)}`);
console.log(`  тайлов: ${data.tiles.length}, миров: ${worldCount}, мест под жетоны: ${spaceCount}`);
console.log(`  боевых карт: ${data.combat.length} (колода ${data.combat.filter(c => !c.upgrade).length}, улучшения ${data.combat.filter(c => c.upgrade).length})`);
console.log(`  приказов-апгрейдов: ${data.orders.length}, событий: ${data.events.length}`);
if (warnings.length) {
    console.log(`\n  пропущено (${warnings.length}):`);
    for (const w of warnings.slice(0, 40)) console.log('   - ' + w);
    if (warnings.length > 40) console.log(`   … ещё ${warnings.length - 40}`);
}
