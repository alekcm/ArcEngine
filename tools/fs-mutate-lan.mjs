// ============================================================================
//  fs-mutate-lan.mjs — prove the LAN identity checks catch broken safeguards
// ----------------------------------------------------------------------------
//  node tools/fs-mutate-lan.mjs             all mutations, sequentially
//  node tools/fs-mutate-lan.mjs --list      show the table without editing
//
//  This temporarily edits the server file and starts a fresh server per case.
//  Do not run it in parallel with other checks. The original file is restored
//  after every mutation; both unmutated baselines must pass.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'tools/fs-server.mjs');
const TABLE = [
    {
        name: 'Страница не знает комнату по умолчанию',
        old: "html = html.split('__FS_DEFAULT_ROOM__').join(defaultRoom.code);",
        replacement: '/* mutation: omit the default room */',
        expected: /код комнаты по умолчанию/,
    },
    {
        name: 'Секрет выбирает клиент',
        old: "id: crypto.randomBytes(24).toString('base64url'),",
        replacement: "id: id || ('p' + this.nextId++),",
        expected: /секреты непредсказуемы/,
    },
    {
        name: 'Секрет опубликован в комнате',
        old: "id: p.publicId || 'bot',",
        replacement: 'id: p.id,',
        expected: /секрет не входит в список комнаты/,
    },
    {
        name: 'Старый сокет может командовать',
        old: 'if (ws.player && ws.player.ws !== ws) {',
        replacement: 'if (false) {',
        expected: /заменено/,
    },
    {
        name: 'Закрытие старого сокета отрывает новый',
        old: 'if (!room || !player || player.ws !== ws) return;',
        replacement: 'if (!room || !player) return;',
        expected: /новый сокет не отключился/,
    },
    {
        name: 'Секрет попадает в диагностический журнал',
        old: "const debug = msg.t === 'hello' ? { ...msg, id: msg.id ? '[private]' : '' } : msg;",
        replacement: 'const debug = msg;',
        expected: /диагностический журнал не раскрывает секрет/,
    },
    {
        name: 'Публичный id бота считается секретом',
        old: 'const known = requestedId ? room.players.find(p => !p.bot && p.id === requestedId) : null;',
        replacement: 'const known = requestedId ? room.players.find(p => p.bot ? p.publicId === requestedId : p.id === requestedId) : null;',
        expected: /публичный id бота не открывает тестовую партию/,
    },
    {
        name: 'Нестроковый id приводится к строке',
        old: "const requestedId = typeof msg.id === 'string' ? msg.id : '';",
        replacement: "const requestedId = msg.id ? String(msg.id) : '';",
        expected: /нестроковый id не открывает место/,
    },
    {
        name: 'Неизвестный режим теста запускается как бой',
        old: "if (msg.mode !== 'map' && msg.mode !== 'battle') return { ok: false, error: 'Неизвестный режим теста.' };",
        replacement: '/* mutation: accept any test mode */',
        expected: /неизвестный режим не запускает партию|объяснён неверный режим/,
    },
    {
        name: 'Ошибка создания теста оставляет бота в лобби',
        old: 'const { players, foePlayer } = testSeats(host);',
        replacement: 'const { players, foePlayer } = testSeats(host); room.players.push(foePlayer);',
        expected: /ошибка создания боя не оставляет бота в лобби/,
    },
    {
        name: 'Соло-тест запускается в общем лобби',
        old: "    if (room.players.length !== 1 || room.players[0] !== host) {\n        return { ok: false, error: 'Тест доступен одному игроку: откройте отдельную комнату через ?room=КОД.' };\n    }",
        replacement: '    /* mutation: allow the test to claim a shared lobby */',
        expected: /тест для одного не запускается в общем лобби/,
    },
    {
        name: 'Отключённые участники теряют место при соло-тесте',
        old: 'room.players.length !== 1 || room.players[0] !== host',
        replacement: 'room.players.filter(p => p.ws).length !== 1 || room.players[0] !== host',
        expected: /отключённые места также нельзя заменить ботом/,
    },
    {
        name: 'Места лобби не перенумеровываются после выхода',
        old: 'this.players.forEach((p, seat) => { p.seat = seat; });',
        replacement: '/* mutation: retain gaps in lobby seats */',
        expected: /места лобби перенумерованы после выхода/,
    },
    {
        name: 'Вышедший из лобби сокет может отменять ход',
        old: '        player.ws = null;\n        ws.player = null;\n        ws.room = null;\n        sendRoomInfo(room);',
        replacement: '        /* mutation: leave the socket attached */\n        sendRoomInfo(room);',
        expected: /покинувший лобби не может отменять ход теста/,
    },
    {
        name: 'Вышедший из партии сокет может отменять ход',
        old: '        player.ws = null;\n        ws.player = null;\n        ws.room = null;\n        sendRoomInfo(room);',
        replacement: '        if (!room.started) { player.ws = null; ws.player = null; ws.room = null; }\n        sendRoomInfo(room);',
        expected: /сокет после выхода не отменил ход/,
    },
    {
        name: 'Комната по умолчанию разделяется после выхода',
        old: 'if (!room.players.length && room !== defaultRoom) rooms.delete(room.code);',
        replacement: 'if (!room.players.length) rooms.delete(room.code);',
        expected: /после выхода последнего игрока адрес и код/,
    },
];

const args = process.argv.slice(2);
const filter = (args.find(arg => !arg.startsWith('--')) || '').toLowerCase();
const rows = TABLE.filter(row => row.name.toLowerCase().includes(filter));
if (args.includes('--list')) {
    for (const row of rows) console.log(row.name);
    process.exit(0);
}
if (!rows.length) {
    console.error('Не выбрана ни одна мутация.');
    process.exit(1);
}

function run() {
    const result = spawnSync(process.execPath, ['tools/fs-lan-check.mjs'], {
        cwd: ROOT, encoding: 'utf8', timeout: 30000,
    });
    return { status: result.status, error: result.error, text: (result.stdout || '') + (result.stderr || '') };
}
function clean(label) {
    const result = run();
    if (result.status !== 0 || result.error || !result.text.includes('LAN: закрытые id')) {
        console.error('  красно ' + label + '\n' + result.text);
        return false;
    }
    console.log('  зелено ' + label);
    return true;
}

console.log('  Мутации LAN: сломанная приватность и переподключение обязаны обнаруживаться');
let failures = clean('до мутаций') ? 0 : 1;
let caught = 0;
for (const row of rows) {
    const original = fs.readFileSync(FILE, 'utf8');
    const count = original.split(row.old).length - 1;
    if (count !== 1) {
        console.error('  якорь ' + row.name + ': найдено ' + count + ' раз');
        failures++;
        continue;
    }
    fs.writeFileSync(FILE, original.replace(row.old, row.replacement));
    let result;
    try { result = run(); } finally { fs.writeFileSync(FILE, original); }
    if (result.status === 1 && !result.error && result.text.includes('LAN: FAIL') && row.expected.test(result.text)) {
        caught++;
        console.log('  ловит ' + row.name);
    } else {
        failures++;
        console.error('  выжила или ошибка проверки: ' + row.name + '\n' + result.text);
    }
}
if (!clean('после мутаций')) failures++;
console.log('\n  Мутаций: ' + rows.length + ', поймано: ' + caught + ', ошибок: ' + failures);
process.exit(failures ? 1 : 0);
