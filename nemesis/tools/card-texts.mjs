// card-texts.mjs — builds docs/NEMESIS_CARD_TEXTS.md: every description the table can show for an
// Attack, an Event, an Adaptation and a Weakness, across the base game and all three DLC packs.
// The strings come from the same modules the client and the engine read, and the Event text goes
// through `eventTextFor` — the very function that prints the card — so the catalogue cannot drift
// from what a player sees in the event window.
//
//   node nemesis/tools/card-texts.mjs           # print the document
//   node nemesis/tools/card-texts.mjs --write   # refresh docs/NEMESIS_CARD_TEXTS.md
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    ATTACK_CARDS, EVENT_CARDS, ADAPTATIONS, WEAKNESSES, INTRUDER_NAMES,
} from '../shared/data/cards.mjs';
import { CARNOMORPH_ATTACK_CARDS, CARNOMORPH_ADAPTATIONS } from '../shared/data/carnomorphs.mjs';
import { CARNOMORPH_EVENT_CARDS } from '../shared/data/carnomorph-events.mjs';
import { VOID_ATTACK_CARDS, VOID_EVENT_CARDS, VOID_WEAKNESSES, VOID_PANIC_CARDS } from '../shared/data/voidseeders.mjs';
import { CHYTRID_ATTACK_CARDS, CHYTRID_EVENT_CARDS, CHYTRID_WEAKNESSES } from '../shared/data/chytrids.mjs';
import { eventTextFor, EVENT_NOISE_TEXT } from '../shared/data/event-text.mjs';

const TOUGH = v => (v === 'retreat' ? '↩ отступление' : String(v));
const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|');
const head = (...cols) => ['| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|'].join('\n');
const row = cells => '| ' + cells.map(cell).join(' | ') + ' |';
const table = (cols, rows) => [head(...cols), ...rows.map(row)].join('\n');
const who = list => (list || []).map(t => INTRUDER_NAMES[t] || t).join(', ');
const finishText = f => (f === 'remove' ? 'убрать из игры, сброс замешать' : f === 'self' ? 'замешать обратно в колоду' : 'в сброс');

function base() {
    const out = ['## Базовая игра (Redux)', ''];
    out.push('### Атаки чужих — ' + ATTACK_CARDS.reduce((n, c) => n + (c.count || 1), 0) + ' карт (' + ATTACK_CARDS.length + ' видов)', '');
    out.push('Одна карта описывает три ранга: взрослый, дрон, королева. В игре показывается ровно этот текст.', '');
    out.push(table(['Кол-во', 'Название', 'Текст'],
        ATTACK_CARDS.map(c => [(c.count || 1) + '×', c.name, c.text])));
    out.push('', '### События — ' + EVENT_CARDS.length + ' карт', '');
    out.push('Текст — тот, что печатается в окне события (движение, эффект и полоса шума).', '');
    out.push(table(['Название', 'Текст'], EVENT_CARDS.map(c => [c.name, eventTextFor(c)])));
    out.push('', '### Адаптации чужих — ' + Object.keys(ADAPTATIONS).length + ' карт', '');
    out.push(table(['Название', 'Текст'], Object.values(ADAPTATIONS).map(a => [a.name, a.text])));
    out.push('', '### Слабости чужих — ' + Object.keys(WEAKNESSES).length + ' карт', '');
    out.push(table(['Название', 'Текст'], Object.values(WEAKNESSES).map(w => [w.name, w.text])));
    return out.join('\n');
}

function carnomorphs() {
    const out = ['## Карноморфы', ''];
    out.push('### Атаки — ' + CARNOMORPH_ATTACK_CARDS.length + ' карт', '');
    out.push('Стойкость напечатана двумя числами: для глодателя и для остальных карноморфов.', '');
    out.push(table(['Название', 'Кто бьёт', 'Стойкость', 'Текст'],
        CARNOMORPH_ATTACK_CARDS.map(c => [c.name, who(c.targets), 'глодатель ' + TOUGH(c.metagorger) + ' · остальные ' + TOUGH(c.other), c.text])));
    out.push('', '### События — ' + CARNOMORPH_EVENT_CARDS.length + ' карт', '');
    out.push(table(['Название', 'Текст (как на столе)', 'После розыгрыша'],
        CARNOMORPH_EVENT_CARDS.map(c => [c.name, eventTextFor(c), finishText(c.finish)])));
    out.push('', '### Адаптации — ' + Object.keys(CARNOMORPH_ADAPTATIONS).length + ' карт', '');
    out.push('В партию попадают три карты (падальщик, гнездарь, мясник); остальные лежат в запасе.', '');
    out.push(table(['Название', 'Текст'], Object.values(CARNOMORPH_ADAPTATIONS).map(a => [a.name, a.text])));
    return out.join('\n');
}

function voidseeders() {
    const out = ['## Сеятели Пустоты (Кошмары)', ''];
    out.push('### Атаки — ' + VOID_ATTACK_CARDS.length + ' карт', '');
    out.push(table(['Название', 'Кто бьёт', 'Стойкость', 'Текст'],
        VOID_ATTACK_CARDS.map(c => [c.name, who(c.targets), TOUGH(c.toughness), c.text])));
    out.push('', '### События — ' + VOID_EVENT_CARDS.length + ' карт', '');
    out.push(table(['Название', 'Текст (как на столе)', 'После розыгрыша'],
        VOID_EVENT_CARDS.map(c => [c.name, eventTextFor(c), finishText(c.finish)])));
    out.push('', '### Уязвимости — ' + Object.keys(VOID_WEAKNESSES).length + ' карт', '');
    out.push(table(['Название', 'Текст'], Object.values(VOID_WEAKNESSES).map(w => [w.name, w.text])));
    out.push('', '### Паника (для справки) — ' + VOID_PANIC_CARDS.length + ' карт', '');
    out.push(table(['Уровень', 'Название', 'Текст'], VOID_PANIC_CARDS.map(c => [c.level + '+', c.name, c.text])));
    return out.join('\n');
}

function chytrids() {
    const out = ['## Хитриды', ''];
    out.push('### Атаки — ' + CHYTRID_ATTACK_CARDS.length + ' карт', '');
    out.push(table(['Название', 'Кто бьёт', 'Стойкость', 'Текст'],
        CHYTRID_ATTACK_CARDS.map(c => [c.name, who(c.targets), TOUGH(c.toughness), c.text])));
    out.push('', '### События — ' + CHYTRID_EVENT_CARDS.length + ' карт', '');
    out.push(table(['Название', 'Текст (как на столе)', 'После розыгрыша'],
        CHYTRID_EVENT_CARDS.map(c => [c.name, eventTextFor(c), finishText(c.finish)])));
    out.push('', '### Уязвимости — ' + Object.keys(CHYTRID_WEAKNESSES).length + ' карт', '');
    out.push(table(['Название', 'Текст'], Object.values(CHYTRID_WEAKNESSES).map(w => [w.name, w.text])));
    return out.join('\n');
}

/* Cards whose printed effect is deliberately skipped in this implementation say so in their own text
 * («… пропускается», «… в Redux не используется»). Listing them is the quickest way to see what is
 * still simplified, without hunting through four tables. */
const SKIPPED = /пропускается|не используется|исключена из игры/;
function skipped() {
    const groups = [
        ['Базовая игра (Redux)', EVENT_CARDS.map(c => [c.name, eventTextFor(c)])],
        ['Карноморфы', [...CARNOMORPH_ATTACK_CARDS.map(c => [c.name, c.text]), ...CARNOMORPH_EVENT_CARDS.map(c => [c.name, eventTextFor(c)])]],
        ['Сеятели Пустоты', [...VOID_ATTACK_CARDS.map(c => [c.name, c.text]), ...VOID_EVENT_CARDS.map(c => [c.name, eventTextFor(c)])]],
        ['Хитриды', [...CHYTRID_ATTACK_CARDS.map(c => [c.name, c.text]), ...CHYTRID_EVENT_CARDS.map(c => [c.name, eventTextFor(c)])]],
    ];
    const out = ['## Где эффект карты пока упрощён', '',
        'Карты, в тексте которых прямо сказано, что часть эффекта пропускается (правила о слизи,',
        'о цвете отсека и т. п.). Это не ошибки вёрстки: так записано в данных, и так карта читается',
        'в игре.', ''];
    for (const [pack, list] of groups) {
        const hits = [...new Set(list.filter(([, text]) => SKIPPED.test(text)).map(([name, text]) => name + ' — ' + text))];
        if (!hits.length) continue;
        out.push('**' + pack + '**', '');
        for (const h of hits) out.push('- ' + h);
        out.push('');
    }
    return out.join('\n');
}

export function cardTexts() {
    const intro = [
        '# Nemesis — все описания атак, событий, адаптаций и уязвимостей',
        '',
        'Документ собран из тех же модулей, с которыми играет движок, и печатает **ровно те строки,',
        'которые видит игрок**: текст атаки — как на карте, текст события — через `eventTextFor`, то есть',
        'вместе с описанием движения и, где предусмотрено, бросков шума. Ничего не переписано руками.',
        '',
        'Что в документе (по каждому набору чужих):',
        '',
        '- **Атаки** — название, кто бьёт, стойкость и текст эффекта;',
        '- **События** — полный текст карты так, как он появляется в окне события;',
        '- **Адаптации** (карноморфы, базовая игра) и **уязвимости** (базовая игра, Сеятели Пустоты, Хитриды) —',
        '  название и текст правила.',
        '',
        '## Сколько чего в игре',
        '',
        table(['Набор чужих', 'Атаки', 'События', 'Адаптации', 'Уязвимости'], [
            ['Базовая игра (Redux)', ATTACK_CARDS.reduce((n, c) => n + (c.count || 1), 0) + ' карт / ' + ATTACK_CARDS.length + ' видов',
                EVENT_CARDS.length + ' карт', Object.keys(ADAPTATIONS).length + ' карт', Object.keys(WEAKNESSES).length + ' карт'],
            ['Карноморфы', CARNOMORPH_ATTACK_CARDS.length + ' карт', CARNOMORPH_EVENT_CARDS.length + ' карт',
                Object.keys(CARNOMORPH_ADAPTATIONS).length + ' карт', '—'],
            ['Сеятели Пустоты (Кошмары)', VOID_ATTACK_CARDS.length + ' карт', VOID_EVENT_CARDS.length + ' карт',
                '—', Object.keys(VOID_WEAKNESSES).length + ' карт'],
            ['Хитриды', CHYTRID_ATTACK_CARDS.length + ' карт', CHYTRID_EVENT_CARDS.length + ' карт',
                '—', Object.keys(CHYTRID_WEAKNESSES).length + ' карт'],
        ]),
        '',
        'Полоса шума у каждого события одна и та же: «' + EVENT_NOISE_TEXT + '».',
        '',
        'Сгенерировано `node nemesis/tools/card-texts.mjs --write`; тест `card-texts.test.mjs` сверяет файл',
        'с генератором, поэтому описания не могут разойтись с игрой.',
        '',
        '---',
        '',
    ];
    return [...intro, base(), '', '---', '', carnomorphs(), '', '---', '', voidseeders(), '', '---', '', chytrids(),
        '', '---', '', skipped(), ''].join('\n');
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const doc = cardTexts();
    if (process.argv.includes('--write')) {
        const target = join(here, '..', '..', 'docs', 'NEMESIS_CARD_TEXTS.md');
        writeFileSync(target, doc);
        console.log('written ' + target + ' (' + doc.split('\n').length + ' lines)');
    } else process.stdout.write(doc + '\n');
}
