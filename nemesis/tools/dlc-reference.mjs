// dlc-reference.mjs — builds docs/NEMESIS_DLC_REFERENCE.md: every printed Attack, Event,
// Adaptation, Mutation, Panic and Vulnerability text of the three DLC packs, straight from the
// data the engine plays with. Nothing here is hand-copied, so the reference can never drift from
// the card the table actually draws.
//
//   node nemesis/tools/dlc-reference.mjs           # print the document
//   node nemesis/tools/dlc-reference.mjs --write   # refresh docs/NEMESIS_DLC_REFERENCE.md
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INTRUDER_NAMES } from '../shared/data/cards.mjs';
import { CARNOMORPH_ATTACK_CARDS, CARNOMORPH_ADAPTATIONS, CARNOMORPH_MUTATIONS } from '../shared/data/carnomorphs.mjs';
import { CARNOMORPH_EVENT_CARDS } from '../shared/data/carnomorph-events.mjs';
import { VOID_ATTACK_CARDS, VOID_PANIC_CARDS, VOID_EVENT_CARDS, VOID_WEAKNESSES, VOID_LIMITS, VOID_LEVEL_TYPES } from '../shared/data/voidseeders.mjs';
import { CHYTRID_ATTACK_CARDS, CHYTRID_EVENT_CARDS, CHYTRID_WEAKNESSES, CHYTRID_LIMITS, CHYTRID_TOKEN_VALUES } from '../shared/data/chytrids.mjs';
import { EVENT_NOISE_TEXT } from '../shared/data/event-text.mjs';
import { RX_CARNOMORPH_TOKENS, RX_CARNOMORPH_LIMIT, RX_CARNOMORPH_ATTACK_CARDS, RX_CARNOMORPH_EVENT_CARDS, RX_CARNOMORPH_ADAPTATIONS, RX_CARNOMORPH_MUTATIONS, RX_CARNOMORPH_BUTCHER_CARDS } from '../shared/data/carnomorphs-redux.mjs';

const TOUGH = v => (v === 'retreat' ? '↩ отступление' : String(v));
const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|');
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|',
    ...rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')].join('\n');
const numbered = list => list.map((x, i) => (i + 1) + '. ' + x).join('\n');

function carnomorphs() {
    const out = ['## Карноморфы', ''];
    out.push('### Атаки (20 карт)', '');
    out.push('Стойкость указана двумя колонками физической карты: для глодателя и для остальных карноморфов.', '');
    out.push(table(['ID', 'Название', 'Кто бьёт', 'Стойкость (глодатель)', 'Стойкость (остальные)', 'Текст'],
        CARNOMORPH_ATTACK_CARDS.map(c => [c.id, c.name, c.targets.map(t => INTRUDER_NAMES[t]).join(', '),
            TOUGH(c.metagorger), TOUGH(c.other), c.text])));
    out.push('', '### События (20 карт)', '');
    out.push(table(['ID', 'Название', 'Движение', 'Эффект', 'После розыгрыша', 'Шум'],
        CARNOMORPH_EVENT_CARDS.map(c => [c.id, c.name, 'все карноморфы — коридор ' + c.move.num, c.text,
            c.finish === 'remove' ? 'убрать из игры, сброс замешать' : c.finish === 'self' ? 'замешать карту в колоду' : 'в сброс',
            c.noise === 'all' ? 'все' : 'нет'])));
    out.push('', 'Броски шума — последний шаг события: «' + EVENT_NOISE_TEXT + '».');
    out.push('', '### Адаптации (8 карт, 3 в игре)', '');
    out.push(table(['Ключ', 'Название', 'Текст'],
        Object.entries(CARNOMORPH_ADAPTATIONS).map(([k, a]) => [k, a.name, a.text])));
    out.push('', '### Мутации персонажей (12 карт, 2 из них выбирают одну)', '');
    out.push(table(['Ключ', 'Название', 'ЗАРАЖЁН', 'НЕ ЗАРАЖЁН'],
        Object.entries(CARNOMORPH_MUTATIONS).map(([k, m]) => [k, m.name, m.infected, m.clean])));
    out.push('', '### Жетоны и подготовка', '');
    out.push(numbered([
        'Мешок: 1 пустой, 2 синих глодателя, 2 красных глодателя и ещё по 1 красному за каждого игрока.',
        'Красный глодатель всегда кладётся в мешок вместо синего, если красные ещё есть в запасе.',
        'Развитие мешка: синий глодатель — жетон в запас, в мешок 1 глодатель, затем все персонажи вне боя бросают шум; красный — жетон в мешок и фигурки глодателей в отсеки с глодателями, тяжёлыми объектами и в гнездо; падальщик и свежеватель — жетон в мешок и бросок шума всем вне боя; мясник — жетон убрать и разыграть столкновение.',
        'Аналога личинки в дополнении нет; в ячейке текущего уровня лежат 8 жетонов яиц и 3 карты адаптаций.',
    ]));
    return out.join('\n');
}

function carnomorphsRedux() {
    const out = ['## Карноморфы Redux', ''];
    out.push('Отдельный набор для Redux. Неописанные на листах правила берутся из Redux; классический набор остаётся доступен только в оригинальных правилах.', '');
    out.push('### Жетоны', '');
    out.push(table(['Тип', 'Значения в запасе', 'Лимит фигурок'],
        Object.entries(RX_CARNOMORPH_TOKENS).map(([t, values]) => [INTRUDER_NAMES[t], values.join(', '), RX_CARNOMORPH_LIMIT[t]])));
    out.push('', 'Мешок: 1 пустой, 5 случайных глодателей и 5 + по одному за игрока случайных жетонов падальщиков, мясных зверей и мясников. Неиспользованные жетоны остаются рядом с планшетом по типам.', '');
    out.push('### Атаки (20 карт)', '');
    out.push(table(['ID', 'Название', 'Падальщик', 'Мясной зверь', 'Мясник'],
        RX_CARNOMORPH_ATTACK_CARDS.map(c => [c.id, c.name, c.lines.shambler.text, c.lines.fleshbeast.text, c.lines.butcher.text])));
    out.push('', '### События (20 карт)', '');
    out.push(table(['ID', 'Название', 'Движение', 'Эффект', 'После розыгрыша', 'Шум'],
        RX_CARNOMORPH_EVENT_CARDS.map(c => [c.id, c.name,
            c.move.type === 'none' ? 'нет' : c.move.type === 'closest' ? 'к ближайшему персонажу' :
                c.move.type === 'closestTwice' ? 'дважды к ближайшему персонажу' : 'коридор ' + c.move.num,
            c.text, c.finish === 'shuffle' ? 'карта и сброс замешиваются' : 'в сброс', 'все'])));
    out.push('', '### Адаптации (8 карт, 3 в игре)', '');
    out.push(table(['Ключ', 'Название', 'Текст'],
        Object.entries(RX_CARNOMORPH_ADAPTATIONS).map(([k, a]) => [k, a.name, a.text])));
    out.push('', '### Мутации персонажей (12 карт)', '');
    out.push(table(['Ключ', 'Название', 'Текст карты'],
        Object.entries(RX_CARNOMORPH_MUTATIONS).map(([k, m]) => [k, m.name, m.infected])));
    out.push('', '### Здоровье Мясника (12 карт)', '');
    out.push(table(['ID', 'Название', 'Дополнительный сброс', 'Текст'],
        RX_CARNOMORPH_BUTCHER_CARDS.map(c => [c.id, c.name, c.extra, c.text])));
    return out.join('\n');
}

function voidseeders() {
    const out = ['## Кошмары (Voidseeders)', ''];
    out.push('### Типы кошмаров', '');
    out.push(table(['Тип', 'Лимит фигурок', 'Безумие, на котором появляется'],
        Object.entries(VOID_LIMITS).filter(([t]) => t !== 'lair').map(([t, n]) => {
            const level = VOID_LEVEL_TYPES.indexOf(t) + 1;
            return [INTRUDER_NAMES[t], n, level ? 'уровень ' + level : '—'];
        })));
    out.push('', '### Атаки (20 карт)', '');
    out.push(table(['ID', 'Название', 'Кто бьёт', 'Стойкость', 'Текст'],
        VOID_ATTACK_CARDS.map(c => [c.id, c.name, c.targets.map(t => INTRUDER_NAMES[t]).join(', '), TOUGH(c.toughness), c.text])));
    out.push('', '### Паника (20 карт)', '');
    out.push(table(['ID', 'Название', 'Уровень безумия', 'Текст'],
        VOID_PANIC_CARDS.map(c => [c.id, c.name, c.level, c.text])));
    out.push('', '### Уязвимости (8 карт)', '');
    out.push(table(['Ключ', 'Название', 'Текст'],
        Object.entries(VOID_WEAKNESSES).map(([k, w]) => [k, w.name, w.text])));
    out.push('', '### События (20 карт)', '');
    out.push(table(['ID', 'Название', 'Движение', 'Эффект', 'После розыгрыша', 'Шум'],
        VOID_EVENT_CARDS.map(c => [c.id, c.name, 'все кошмары — коридор ' + c.move.num, c.text,
            c.finish === 'remove' ? 'убрать из игры, сброс замешать' : c.finish === 'shuffleDiscard' ? 'сброс замешать' : 'в сброс',
            c.noise === 'all' ? 'все' : 'нет'])));
    out.push('', 'Броски шума — последний шаг события: «' + EVENT_NOISE_TEXT + '».');
    out.push('', '### Особенности', '');
    out.push(numbered([
        'Кошмар не оставляет останков: при уничтожении в мешок кладётся случайный жетон кошмара.',
        'Кошмары игнорируют закрытые двери, пока не открыта уязвимость «Плотные перегородки».',
        'Логово не двигается; персонажи в отсеке с логовом считаются в бою и бросают шум в конце хода, даже находясь в бою.',
        'Внезапная атака кошмара — 1 карта инфекции и карта паники.',
    ]));
    return out.join('\n');
}

function chytrids() {
    const out = ['## Хитриды', ''];
    out.push('### Жетоны', '');
    out.push(table(['Тип', 'Значения на жетонах', 'Лимит фигурок'],
        Object.entries(CHYTRID_TOKEN_VALUES).map(([t, values]) => [INTRUDER_NAMES[t], values.join(', '), CHYTRID_LIMITS[t]])));
    out.push('', '### Атаки (20 карт)', '');
    out.push(table(['ID', 'Название', 'Кто бьёт', 'Стойкость', 'Текст'],
        CHYTRID_ATTACK_CARDS.map(c => [c.id, c.name, c.targets.map(t => INTRUDER_NAMES[t]).join(', '), TOUGH(c.toughness), c.text])));
    out.push('', '### Уязвимости (6 карт)', '');
    out.push(table(['Ключ', 'Название', 'Текст'],
        Object.entries(CHYTRID_WEAKNESSES).map(([k, w]) => [k, w.name, w.text])));
    out.push('', '### События (20 карт)', '');
    out.push(table(['ID', 'Название', 'Движение', 'Рост', 'Эффект', 'Шум'],
        CHYTRID_EVENT_CARDS.map(c => [c.id, c.name,
            (c.mover === 'growth' ? 'споры' : 'все хитриды') + ', коридоры ' + c.numbers.join(' и '),
            c.growth.join(', ') || 'нет', c.text, c.noise === 'all' ? 'все' : 'нет'])));
    out.push('', 'Броски шума — последний шаг события: «' + EVENT_NOISE_TEXT + '».');
    return out.join('\n');
}

export function dlcReference() {
    const head = [
        '# Все карты дополнений «Немезиды»',
        '',
        'Справочник собран из тех же данных, которыми играет движок (`nemesis/shared/data/*`), поэтому',
        'формулировки на столе и в документе совпадают дословно. Пересобрать:',
        '',
        '```',
        'node nemesis/tools/dlc-reference.mjs --write',
        '```',
        '',
        'Сквозные правила, принятые для всех дополнений:',
        '',
        '- **Движение событий — одно на всех.** Верхняя полоса карты события читается как в Redux:',
        '  «все чужие движутся по коридору N». Разделения «кто из фигурок ходит» больше нет.',
        '  Движение, напечатанное внутри эффекта (королева уходит в гнездо, фигурка встаёт в',
        '  вентиляцию), остаётся ровно таким, как написано в эффекте.',
        '- **Шум события — как в Redux.** После эффекта карты события каждый персонаж вне боя делает',
        '  бросок шума; порядок и пропуски (периметровое устройство, `inconspicuous`) — общие для всех',
        '  дополнений. У карноморфов бросок идёт последним шагом, уже после появления фигурок.',
        '- **Внезапная атака — одно сравнение.** Чужой атакует сразу, если карт в руке меньше числа',
        '  на вытянутом жетоне; дополнения только меняют это число. В журнале всегда одна строка:',
        '  «Внезапная атака: <кто> нападает на <кого> — карт в руке A < B».',
        '',
        '---',
        '',
    ];
    return [...head, carnomorphs(), '', '---', '', carnomorphsRedux(), '', '---', '', voidseeders(), '', '---', '', chytrids(), ''].join('\n');
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const doc = dlcReference();
    if (process.argv.includes('--write')) {
        const target = join(here, '..', '..', 'docs', 'NEMESIS_DLC_REFERENCE.md');
        writeFileSync(target, doc);
        console.log('written ' + target + ' (' + doc.split('\n').length + ' lines)');
    } else process.stdout.write(doc + '\n');
}
