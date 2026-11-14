// ============================================================================
//  fs-lan-check.mjs — reconnect identity and private views on the real server
// ----------------------------------------------------------------------------
//  node tools/fs-lan-check.mjs
//
//  This starts an isolated LAN server and uses raw WebSocket clients (no browser
//  or external packages). A public lobby id must never authenticate another seat;
//  the private reconnect id must still work, including when the old socket closes
//  after its replacement has joined. The game engine remains authoritative.
//  The lobby itself is checked too: nothing starts by itself — the guests press
//  «Готов», the host presses «Начать игру», and a faction may be changed until then.
// ============================================================================
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { createEngineContext } from './fs-engine.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
}

async function startServer(port) {
    const child = spawn(process.execPath, ['tools/fs-server.mjs', '--no-open', '--port=' + port], {
        cwd: ROOT, env: { ...process.env, FS_DEBUG: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const actualPort = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Сервер не запустился: ' + output)), 20000);
        const scan = () => {
            const match = /http:\/\/localhost:(\d+)\//.exec(output);
            if (!match) return;
            clearTimeout(timeout);
            child.stdout.off('data', scan);
            resolve(Number(match[1]));
        };
        child.stdout.on('data', scan);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => { clearTimeout(timeout); reject(new Error('Сервер завершился: ' + code + '\n' + output)); });
        scan();
    }).catch(error => { child.kill('SIGTERM'); throw error; });
    return { child, port: actualPort, output: () => output };
}

// Minimal RFC 6455 client: the server sends unmasked text frames; client frames
// are masked. The buffer handles partial TCP reads and large state broadcasts.
class Client {
    constructor(socket, initial) {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.messages = [];
        this.waiters = [];
        socket.on('data', data => this.read(data));
        socket.on('error', () => {});
        if (initial.length) this.read(initial);
    }

    static async connect(port) {
        const key = crypto.randomBytes(16).toString('base64');
        return new Promise((resolve, reject) => {
            const req = http.request({
                host: '127.0.0.1', port, path: '/ws',
                headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key },
            });
            req.once('upgrade', (res, socket, head) => {
                const expected = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
                if (res.headers['sec-websocket-accept'] !== expected) {
                    socket.destroy(); reject(new Error('Неверное подтверждение WebSocket')); return;
                }
                resolve(new Client(socket, head));
            });
            req.once('response', res => { res.resume(); reject(new Error('Нет WebSocket: HTTP ' + res.statusCode)); });
            req.once('error', reject);
            req.end();
        });
    }

    read(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
        for (;;) {
            const b = this.buffer;
            if (b.length < 2) return;
            let length = b[1] & 0x7f;
            let offset = 2;
            if (length === 126) { if (b.length < 4) return; length = b.readUInt16BE(2); offset = 4; }
            else if (length === 127) { if (b.length < 10) return; length = Number(b.readBigUInt64BE(2)); offset = 10; }
            if (b.length < offset + length) return;
            const payload = b.subarray(offset, offset + length);
            this.buffer = b.subarray(offset + length);
            if ((b[0] & 0x0f) !== 1) continue;
            const message = JSON.parse(payload.toString('utf8'));
            const index = this.waiters.findIndex(waiter => waiter.predicate(message));
            if (index < 0) this.messages.push(message);
            else {
                const waiter = this.waiters.splice(index, 1)[0];
                clearTimeout(waiter.timeout);
                waiter.resolve(message);
            }
        }
    }

    send(message) {
        const payload = Buffer.from(JSON.stringify(message));
        let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) {
            header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0xfe; header.writeUInt16BE(payload.length, 2);
        } else {
            header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0xff; header.writeBigUInt64BE(BigInt(payload.length), 2);
        }
        const mask = crypto.randomBytes(4);
        const masked = Buffer.from(payload);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
        this.socket.write(Buffer.concat([header, mask, masked]));
    }

    take(predicate, label) {
        const index = this.messages.findIndex(predicate);
        if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
            const waiter = { predicate, resolve, timeout: null };
            waiter.timeout = setTimeout(() => {
                const i = this.waiters.indexOf(waiter);
                if (i >= 0) this.waiters.splice(i, 1);
                reject(new Error('Нет ответа: ' + label));
            }, 10000);
            this.waiters.push(waiter);
        });
    }

    close() {
        if (this.socket.destroyed) return Promise.resolve();
        const closed = new Promise(resolve => this.socket.once('close', resolve));
        // An empty, masked close frame lets the server complete its close
        // handler; a bare TCP half-close does not exercise that path reliably.
        this.socket.end(Buffer.from([0x88, 0x80, 0, 0, 0, 0]));
        return closed;
    }
}

const t = kind => message => message.t === kind;
// The ordinary start: the first client is the host (he only presses «Начать
// игру»), everybody else chooses a faction and presses «Готов».
const startParty = async (seats) => {
    for (const [client, faction] of seats) client.send({ t: 'faction', faction });
    for (const [client] of seats.slice(1)) client.send({ t: 'ready', ready: true });
    const [host] = seats[0];
    await host.take(message => message.t === 'room' && message.start && message.start.ok, 'лобби готово к старту');
    host.send({ t: 'start' });
};
const clients = [];
let server;
try {
    server = await startServer(await freePort());
    const connect = async () => { const client = await Client.connect(server.port); clients.push(client); return client; };

    // A plain address must expose the server's actual default room before the
    // client chooses which room-specific secret to send in its first hello.
    const page = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: server.port, path: '/' }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => response.statusCode === 200 ? resolve(body) : reject(new Error('HTTP ' + response.statusCode)));
        }).on('error', reject);
    });
    const code = /<meta name="fs-default-room" content="([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4})">/.exec(page);
    assert.ok(code, 'страница должна содержать код комнаты по умолчанию');
    const defaultClient = await connect();
    defaultClient.send({ t: 'hello', room: '', name: 'Адрес без комнаты', id: '' });
    const defaultJoin = await defaultClient.take(t('joined'), 'обычный адрес');
    assert.equal(defaultJoin.room, code[1], 'код страницы совпадает с комнатой по умолчанию сервера');
    assert.ok(!page.includes(defaultJoin.id), 'секрет не публикуется на странице');
    const defaultLobby = await defaultClient.take(t('room'), 'список комнаты по умолчанию');
    assert.ok(!JSON.stringify(defaultLobby).includes(defaultJoin.id), 'секрет не входит в список комнаты');
    const defaultReturn = await connect();
    defaultReturn.send({ t: 'hello', room: '  ' + code[1].toLowerCase() + '  ', name: 'Тот же игрок', id: defaultJoin.id });
    const defaultBack = await defaultReturn.take(t('joined'), 'обычный адрес по каноническому коду');
    assert.equal(defaultBack.id, defaultJoin.id, 'обычный адрес и явный код возвращают одно место');
    assert.equal(defaultBack.seat, defaultJoin.seat, 'при повторном входе не создаётся новое место');
    await defaultClient.close();
    defaultReturn.send({ t: 'ping' });
    const stillConnected = await defaultReturn.take(message => message.t === 'pong' || message.t === 'err', 'сокет после закрытия старого');
    assert.equal(stillConnected.t, 'pong', 'новый сокет не отключился после закрытия старого');
    defaultReturn.send({ t: 'leave' });
    defaultReturn.send({ t: 'ping' });
    await defaultReturn.take(t('pong'), 'выход последнего игрока комнаты по умолчанию');
    const freshDefault = await connect();
    freshDefault.send({ t: 'hello', room: '', name: 'Новый адрес без комнаты' });
    const freshJoin = await freshDefault.take(t('joined'), 'повторный вход в комнату по умолчанию');
    const freshByCode = await connect();
    freshByCode.send({ t: 'hello', room: code[1], name: 'Тот же игрок', id: freshJoin.id });
    const freshBack = await freshByCode.take(t('joined'), 'повторный вход по коду после выхода');
    assert.equal(freshBack.id, freshJoin.id, 'после выхода последнего игрока адрес и код всё ещё ведут в одну комнату');
    await defaultReturn.close();
    await freshDefault.close();
    await freshByCode.close();

    // A solo test has a visible opponent but only the host is a real player.
    // Its public bot id must never authenticate a socket or reveal either seat.
    for (const mode of ['map', 'battle']) {
        const soloRoom = 'SOLO' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const host = await connect();
        host.send({ t: 'hello', room: soloRoom, name: 'Хозяин теста' });
        const hostJoin = await host.take(t('joined'), 'вход хозяина теста');
        if (mode === 'map') {
            host.send({ t: 'test', mode: 'unknown' });
            const unknown = await host.take(message => message.t === 'err' || message.t === 'state', 'неизвестный тест');
            assert.equal(unknown.t, 'err', 'неизвестный режим не запускает партию');
            assert.match(unknown.msg, /неизвестный режим/i, 'объяснён неверный режим');
            host.send({ t: 'palette', palette: { primary: '#112233' } });
            const unchanged = await host.take(message => message.t === 'room'
                && message.players.some(p => p.palette && p.palette.primary === '#112233'), 'лобби после неизвестного режима');
            assert.equal(unchanged.players.length, 1, 'неизвестный режим не добавляет бота и не меняет лобби');
            host.send({ t: 'test', mode: 'battle', battle: { cards: 'not-an-array' } });
            const malformed = await host.take(message => message.t === 'err' || message.t === 'state', 'ошибка создания тестового боя');
            assert.equal(malformed.t, 'err', 'неверные данные боя отклонены');
            host.send({ t: 'palette', palette: { primary: '#445566' } });
            const afterError = await host.take(message => message.t === 'room'
                && message.players.some(p => p.palette && p.palette.primary === '#445566'), 'лобби после ошибки боя');
            assert.equal(afterError.players.length, 1, 'ошибка создания боя не оставляет бота в лобби');
        }
        host.send({ t: 'faction', faction: 'адептус-механикус' });
        host.send({ t: 'test', mode, battle: { kind: 'ground', units: { 'скитарии': 1 } } });
        const view = await host.take(message => message.t === 'state' && message.solo, 'старт теста ' + mode);
        assert.equal(view.mode, mode, 'выбран нужный режим');
        let undo = 0;
        if (mode === 'map') {
            const unit = view.view.units.find(u => u.seat === view.view.seat);
            assert.ok(unit, 'у активной стороны тестовой карты есть отряд');
            host.send({ t: 'cmd', cmd: { type: 'placeOrder', system: unit.system, order: 'advance' } });
            const first = await host.take(message => message.t === 'err'
                || (message.t === 'state' && message.view.undo === 1), 'первый приказ в тесте');
            assert.equal(first.t, 'state', 'хозяин может сделать первый ход: ' + (first.msg || ''));
            assert.notEqual(first.view.seat, view.view.seat, 'тест показывает хозяину второе место');
            undo = 1;
        }
        const soloLobby = await host.take(message => message.t === 'room' && message.started, 'список теста');
        const bot = soloLobby.players.find(player => player.seat === 1);
        assert.ok(bot && bot.id === 'bot', 'в тесте виден публичный id противника');

        const intruder = await connect();
        intruder.send({ t: 'hello', room: soloRoom, name: 'Чужой', id: bot.id });
        const rejected = await intruder.take(t('joined'), 'отказ публичному id бота');
        assert.equal(rejected.id, '', 'публичный id бота не открывает тестовую партию');
        await intruder.take(t('err'), 'причина отказа в тесте');
        intruder.send({ t: 'undo' });
        intruder.send({ t: 'ping' });
        await intruder.take(t('pong'), 'сокет без места обработан');
        assert.ok(!intruder.messages.some(message => message.t === 'state'), 'чужой не получил состояние теста');

        const restored = await connect();
        restored.send({ t: 'hello', room: soloRoom, name: 'Хозяин теста', id: hostJoin.id });
        const back = await restored.take(t('joined'), 'хозяин вернулся в тест');
        const resumed = await restored.take(message => message.t === 'state' && message.solo, 'состояние возвращённого теста');
        assert.equal(back.id, hostJoin.id, 'секрет хозяина по-прежнему работает');
        assert.equal(resumed.mode, mode, 'сохранился режим теста');
        assert.equal(resumed.view.undo, undo, 'чужая отмена не изменила тест');
        if (mode === 'map') {
            const unit = resumed.view.units.find(u => u.seat === resumed.view.seat);
            assert.ok(unit, 'у второго места есть отряд для приказа');
            restored.send({ t: 'cmd', cmd: { type: 'placeOrder', system: unit.system, order: 'advance' } });
            const second = await restored.take(message => message.t === 'err'
                || (message.t === 'state' && message.view.undo === 2), 'второй приказ в тесте');
            assert.equal(second.t, 'state', 'после переподключения хозяин действует и за второе место: ' + (second.msg || ''));
            assert.equal(second.view.seat, view.view.seat, 'ход вернулся первому месту');
        }
        host.send({ t: 'undo' });
        host.send({ t: 'ping' });
        const stale = await host.take(message => message.t === 'err' || message.t === 'pong', 'старый сокет теста не действует');
        assert.equal(stale.t, 'err', 'соединение заменено и старый сокет не может командовать');
        assert.match(stale.msg, /заменено/i);
        await host.close();
        await intruder.close();
        await restored.close();
    }

    // Starting a solo test must not overwrite other lobby members or let a
    // departed socket keep controlling the new test as the active seat.
    {
        const sharedRoom = 'SHARED' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const host = await connect();
        let departed = await connect(), third = await connect();
        const joins = [];
        for (const [client, name] of [[host, 'Хозяин'], [departed, 'Ушедший'], [third, 'Третий']]) {
            client.send({ t: 'hello', room: sharedRoom, name });
            joins.push(await client.take(t('joined'), 'участник общего лобби'));
        }
        assert.deepEqual(joins.map(join => join.seat), [0, 1, 2]);
        host.send({ t: 'test', mode: 'map' });
        const refused = await host.take(message => message.t === 'err'
            || (message.t === 'state' && message.solo), 'тест в общем лобби');
        assert.equal(refused.t, 'err', 'тест для одного не запускается в общем лобби');
        assert.match(refused.msg, /один|отдельн/i, 'объясняется необходимость отдельной комнаты');
        host.send({ t: 'ping' });
        await host.take(t('pong'), 'синхронизация общего лобби');
        host.messages = host.messages.filter(message => message.t !== 'room');
        await departed.close();
        await host.take(t('room'), 'сервер заметил отключение второго');
        await third.close();
        await host.take(t('room'), 'сервер заметил отключение третьего');
        host.send({ t: 'test', mode: 'map' });
        const offline = await host.take(message => message.t === 'err'
            || (message.t === 'state' && message.solo), 'тест с временно отключёнными участниками');
        assert.equal(offline.t, 'err', 'отключённые места также нельзя заменить ботом');
        departed = await connect();
        departed.send({ t: 'hello', room: sharedRoom, name: 'Ушедший', id: joins[1].id });
        assert.equal((await departed.take(t('joined'), 'возвращение второго в лобби')).seat, 1);
        third = await connect();
        third.send({ t: 'hello', room: sharedRoom, name: 'Третий', id: joins[2].id });
        assert.equal((await third.take(t('joined'), 'возвращение третьего в лобби')).seat, 2);

        departed.send({ t: 'leave' });
        departed.send({ t: 'ping' });
        await departed.take(t('pong'), 'выход второго игрока');
        const two = await host.take(message => message.t === 'room' && !message.started
            && message.players.length === 2 && message.players.some(p => p.name === 'Третий'), 'лобби после выхода');
        assert.deepEqual(two.players.map(p => p.seat), [0, 1], 'места лобби перенумерованы после выхода');
        third.send({ t: 'hello', room: sharedRoom, name: 'Третий', id: joins[2].id });
        assert.equal((await third.take(t('joined'), 'новое место третьего участника')).seat, 1,
            'после выхода место действительно изменилось для участника');
        third.send({ t: 'leave' });
        third.send({ t: 'ping' });
        await third.take(t('pong'), 'выход третьего игрока');
        await host.take(message => message.t === 'room' && !message.started
            && message.players.length === 1 && message.players[0].name === 'Хозяин', 'отдельное лобби');
        host.send({ t: 'faction', faction: 'адептус-механикус' });
        host.send({ t: 'test', mode: 'map' });
        const before = await host.take(message => message.t === 'state' && message.solo, 'тест после выхода гостей');
        const unit = before.view.units.find(u => u.seat === before.view.seat);
        assert.ok(unit, 'у активной стороны есть отряд для приказа');
        host.send({ t: 'cmd', cmd: { type: 'placeOrder', system: unit.system, order: 'advance' } });
        const placed = await host.take(message => message.t === 'err'
            || (message.t === 'state' && message.view.undo === 1), 'приказ в тесте');
        assert.equal(placed.t, 'state', 'хозяин может действовать: ' + (placed.msg || ''));
        for (const client of [departed, third]) {
            client.send({ t: 'undo' });
            client.send({ t: 'ping' });
            await client.take(t('pong'), 'покинувший лобби сокет обработан');
        }
        const restored = await connect();
        restored.send({ t: 'hello', room: sharedRoom, name: 'Хозяин', id: joins[0].id });
        await restored.take(t('joined'), 'хозяин вернулся после попыток отмены');
        const resumed = await restored.take(message => message.t === 'state' && message.solo, 'состояние после попыток отмены');
        assert.equal(resumed.view.undo, 1, 'покинувший лобби не может отменять ход теста');
        departed.send({ t: 'hello', room: 'NEW' + sharedRoom, name: 'В новой комнате' });
        const newJoin = await departed.take(t('joined'), 'ушедший может войти в новую комнату тем же сокетом');
        assert.notEqual(newJoin.id, joins[1].id, 'после выхода выдаётся новый секрет');
        for (const client of [host, departed, third, restored]) await client.close();
    }

    // The lobby of the ordinary party: three friends, two of whom have chosen —
    // the party must wait for the third; «Готов» and «Начать игру» drive the
    // start, the faction may be changed until then, and a seat that has gone
    // silent can be cleared by the host.
    {
        const code = 'LOBBY' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const host = await connect(), guest = await connect(), late = await connect();
        const joins = [];
        for (const [client, name] of [[host, 'Хозяин'], [guest, 'Гость'], [late, 'Третий']]) {
            client.send({ t: 'hello', room: code, name });
            joins.push(await client.take(t('joined'), 'участник лобби'));
        }
        assert.ok(joins.every(join => /^p\d+$/.test(join.publicId)), 'joined называет публичный id места');
        const roomOf = (client, pred, what) => client.take(message => message.t === 'room' && pred(message), what);
        const full = await roomOf(late, m => m.players.length === 3, 'лобби из трёх');
        assert.equal(full.host, joins[0].publicId, 'хозяин — первый вошедший');
        assert.deepEqual(full.players.map(p => p.id), joins.map(join => join.publicId), 'публичные id списка совпадают с joined');
        assert.ok(full.players.every(p => p.online === true && p.ready === false && p.bot === false), 'все на связи, никто не готов');
        assert.equal(full.start.ok, false, 'без фракций старт закрыт');

        // The classic failure: two of three have chosen — nothing may start.
        host.send({ t: 'faction', faction: 'эльдары' });
        guest.send({ t: 'faction', faction: 'орки' });
        guest.send({ t: 'ready', ready: true });
        const twoChosen = await roomOf(host, m => m.players.filter(p => p.faction).length === 2
            && m.players.some(p => p.name === 'Гость' && p.ready), 'двое выбрали');
        assert.equal(twoChosen.started, false, 'двое из трёх выбрали — партия не началась');
        assert.equal(twoChosen.start.ok, false, 'кнопка старта закрыта, пока третий без фракции');
        assert.match(twoChosen.start.msg, /Третий/, 'причина называет того, кого ждём');
        host.send({ t: 'start' });
        const early = await host.take(message => message.t === 'err' || message.t === 'state', 'преждевременный старт');
        assert.equal(early.t, 'err', 'сервер не стартует без третьего');
        assert.match(early.msg, /фракци/i, 'отказ объясняет, чего не хватает');

        // Readiness needs a faction; a guest cannot start the party.
        late.send({ t: 'ready', ready: true });
        assert.match((await late.take(t('err'), 'готовность без фракции')).msg, /фракци/i);
        late.send({ t: 'start' });
        assert.match((await late.take(t('err'), 'старт не хозяином')).msg, /хозяин/i);

        // The faction may be changed as long as the party has not started; a
        // changed faction drops the readiness, an unknown one is refused.
        guest.send({ t: 'faction', faction: 'некроны' });
        const rechosen = await roomOf(host, m => m.players.some(p => p.name === 'Гость' && p.faction === 'некроны'), 'смена фракции');
        assert.equal(rechosen.players.find(p => p.name === 'Гость').ready, false, 'смена фракции снимает готовность');
        guest.send({ t: 'faction', faction: 'клингоны' });
        assert.match((await guest.take(t('err'), 'неизвестная фракция')).msg, /нет такой/i);
        guest.send({ t: 'ready', ready: true });
        await roomOf(host, m => m.players.some(p => p.name === 'Гость' && p.ready), 'гость снова готов');

        // The same faction twice is still refused (the engine keys objectives by faction).
        late.send({ t: 'faction', faction: 'некроны' });
        const clash = await roomOf(host, m => m.players.filter(p => p.faction === 'некроны').length === 2, 'две одинаковые фракции');
        assert.equal(clash.start.ok, false, 'одинаковые фракции закрывают старт');
        assert.match(clash.start.msg, /одну фракцию/i);
        late.send({ t: 'faction', faction: 'тираниды' });
        await roomOf(host, m => m.players.some(p => p.name === 'Третий' && p.faction === 'тираниды'), 'третий выбрал');
        host.send({ t: 'start' });
        const notReady = await host.take(message => message.t === 'err' || message.t === 'state', 'старт без готовности третьего');
        assert.equal(notReady.t, 'err', 'без «Готов» третьего партия не начинается');
        assert.match(notReady.msg, /готовность: Третий/i);

        // A fourth friend opens the link and closes the tab: his silent seat
        // would block the start — the host clears it. An online seat cannot be cleared.
        const ghost = await connect();
        ghost.send({ t: 'hello', room: code, name: 'Призрак' });
        const ghostJoin = await ghost.take(t('joined'), 'четвёртый участник');
        await roomOf(host, m => m.players.length === 4, 'лобби из четырёх');
        host.send({ t: 'kick', id: ghostJoin.publicId });
        assert.match((await host.take(t('err'), 'убрать игрока на связи')).msg, /на связи/i);
        // A fifth friend is refused at the door: the party is for two to four.
        const fifth = await connect();
        fifth.send({ t: 'hello', room: code, name: 'Пятый' });
        assert.equal((await fifth.take(t('joined'), 'пятый участник')).id, '', 'пятому место не выдаётся');
        assert.match((await fifth.take(t('err'), 'причина отказа пятому')).msg, /четыре игрока/i);
        await fifth.close();
        await ghost.close();
        const offline = await roomOf(host, m => m.players.some(p => p.name === 'Призрак' && p.online === false), 'сервер заметил отключение четвёртого');
        assert.equal(offline.players.length, 4, 'пятый не занял место');
        assert.match(offline.start.msg, /Призрак/, 'молчащее место названо причиной ожидания');
        late.send({ t: 'kick', id: ghostJoin.publicId });
        assert.match((await late.take(t('err'), 'убрать не хозяином')).msg, /хозяин/i);
        host.send({ t: 'kick', id: ghostJoin.publicId });
        await roomOf(host, m => m.players.length === 3 && !m.players.some(p => p.name === 'Призрак'), 'место убрано');

        // Everybody ready — the host starts; every seat gets its own view.
        late.send({ t: 'ready', ready: true });
        const ready = await roomOf(host, m => m.start.ok, 'все готовы');
        assert.equal(ready.players.filter(p => p.ready).length, 2, 'готовы оба гостя, хозяину кнопка «Готов» не нужна');
        host.send({ t: 'start' });
        const views = await Promise.all([host, guest, late].map((client, seat) =>
            client.take(message => message.t === 'state' && message.view.seat === seat, 'состояние места ' + seat)));
        assert.deepEqual(views.map(m => m.view.players[m.view.seat].faction), ['эльдары', 'некроны', 'тираниды'], 'партия идёт выбранными фракциями');
        const begun = await roomOf(host, m => m.started, 'список начатой партии');
        assert.equal(begun.start.ok, false, 'в начатой партии кнопки старта нет');
        guest.send({ t: 'faction', faction: 'орки' });
        assert.match((await guest.take(t('err'), 'смена фракции после старта')).msg, /уже идёт/i);
        host.send({ t: 'start' });
        assert.match((await host.take(t('err'), 'повторный старт')).msg, /уже идёт/i);
        for (const client of [host, guest, late]) await client.close();
    }

    // Exercise facedown order secrecy on the real server, not just on an
    // in-process projection. Complete setup using each participant's own view,
    // put two orders in one stack, then reconnect and undo the cover.
    {
        const rules = createEngineContext().FS_RULES;
        const code = 'ORDERS' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const actors = [await connect(), await connect()], joins = [];
        for (const [seat, client] of actors.entries()) {
            client.send({ t: 'hello', room: code, name: seat ? 'Сосед' : 'Эльдар' });
            joins.push(await client.take(t('joined'), 'участник проверки приказов'));
        }
        await startParty([[actors[0], 'эльдары'], [actors[1], 'имперская-гвардия']]);
        let views = await Promise.all(actors.map((client, seat) =>
            client.take(message => message.t === 'state' && message.view.seat === seat, 'сборка карты для места ' + seat)));
        views = views.map(message => message.view);
        const apply = async (seat, cmd) => {
            const next = views[0].undo + 1;
            actors[seat].send({ t: 'cmd', cmd });
            const received = await Promise.all(actors.map((client, i) => client.take(message => message.t === 'err'
                || (message.t === 'state' && message.view.undo === next), 'команда места ' + i + ': ' + cmd.type)));
            for (const message of received) assert.equal(message.t, 'state', 'сервер отклонил ' + cmd.type + ': ' + (message.msg || ''));
            views = received.map(message => message.view);
        };
        for (let i = 0; i < 160 && views[0].phase === 'setup'; i++) {
            const seat = views[0].setup.turn, state = views[seat], setup = state.setup;
            let cmd = null;
            if (setup.stage === 'tile') {
                const cell = setup.legalCells[0];
                cmd = { type: 'placeSystemTile', tile: setup.hand[0], row: cell.row, col: cell.col };
            } else if (setup.stage === 'forces') {
                const initial = state.players[seat].initialForces;
                const sys = state.systems.find(system => system.id === setup.currentSystem);
                for (const id of Object.keys(initial.units).filter(id => initial.units[id] > 0)) {
                    const def = rules.unitDef(state, seat, id);
                    const area = sys.areas.find(a => !!a.world === (def.type !== 'ship')
                        && rules.unitsAt(state, sys.id, a.pos).length < rules.capacity(state, sys.id, a.pos));
                    if (area) { cmd = { type: 'setupUnit', unit: id, pos: area.pos }; break; }
                }
                if (!cmd) for (const type of Object.keys(initial.structures).filter(id => initial.structures[id] > 0)) {
                    const area = sys.areas.find(a => a.world && rules.canPlaceStructure(state, seat, sys.id, a.pos, { ignoreControl: true }).ok);
                    if (area) { cmd = { type: 'setupStructure', structure: type, pos: area.pos }; break; }
                }
                if (!cmd) cmd = { type: 'finishSetupForces' };
            } else if (setup.stage === 'objectives') {
                const option = setup.objectiveOptions[0];
                cmd = { type: 'setupObjective', faction: option.faction, pos: option.areas[0] };
            } else if (setup.stage === 'storms') {
                for (const sys of state.systems) {
                    const side = rules.setupStormSides(state, sys.id)[0];
                    if (side) { cmd = { type: 'setupStorm', system: sys.id, side }; break; }
                }
            }
            assert.ok(cmd, 'известный шаг сборки: ' + setup.stage);
            await apply(seat, cmd);
        }
        assert.equal(views[0].phase, 'planning', 'сборка завершена');
        const system = views[0].systems.find(sys => rules.canPlaceOrder(views[0], 0, sys.id)
            && rules.canPlaceOrder(views[1], 1, sys.id));
        assert.ok(system, 'есть общая система для двух приказов');
        const first = views[0].turn, second = 1 - first;
        const face = first === 0 ? 'deploy' : 'dominate';
        await apply(first, { type: 'placeOrder', system: system.id, order: face });
        const pile = view => view.systems.find(sys => sys.id === system.id).tokens;
        assert.equal(pile(views[first])[0].order, face, 'владелец видит свой верхний приказ');
        assert.equal(pile(views[second])[0].order, undefined, 'противник не получает лицо верхнего приказа');
        assert.equal(views[second].players[first].placedOf, undefined, 'счётчик не выдаёт закрытый приказ');
        assert.ok(!views[second].log.some(entry => /выложил приказ «/.test(entry.text)), 'журнал не раскрывает приказ');
        await apply(second, { type: 'placeOrder', system: system.id, order: second === 0 ? 'strategize' : 'advance' });
        assert.equal(pile(views[first])[0].order, undefined, 'владелец не видит приказ под другим жетоном');
        assert.equal(pile(views[first])[1].order, undefined, 'чужой верхний приказ также закрыт');
        assert.equal(pile(views[second])[1].order, second === 0 ? 'strategize' : 'advance', 'свой новый верхний приказ доступен');

        const restored = await connect();
        restored.send({ t: 'hello', room: code, name: 'Вернувшийся', id: joins[first].id });
        assert.equal((await restored.take(t('joined'), 'возвращение владельца приказа')).seat, first);
        const replay = await restored.take(message => message.t === 'state' && message.view.seat === first, 'приказы после reconnect');
        assert.equal(pile(replay.view)[0].order, undefined, 'reconnect не раскрывает накрытый приказ');
        assert.equal(pile(replay.view)[1].order, undefined, 'reconnect не раскрывает чужой приказ');
        await actors[first].close();
        actors[first] = restored;
        restored.send({ t: 'undo' });
        const undone = await Promise.all(actors.map((client, seat) => client.take(message => message.t === 'state'
            && message.view.undo === replay.view.undo - 1, 'отмена последнего приказа для ' + seat)));
        views = undone.map(message => message.view);
        assert.equal(pile(views[first])[0].order, face, 'после отмены владелец снова видит верхний приказ');
        assert.equal(pile(views[second])[0].order, undefined, 'противнику приказ всё ещё закрыт');
        for (const client of actors) await client.close();
    }

    // After a middle lobby seat leaves, a normal three-player game must bind
    // each remaining socket to the same seat as the authoritative game state.
    {
        const code = 'REINDEX' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const first = await connect(), middle = await connect(), last = await connect();
        const joins = [];
        for (const [client, name] of [[first, 'Первый'], [middle, 'Ушедший'], [last, 'Оставшийся']]) {
            client.send({ t: 'hello', room: code, name });
            joins.push(await client.take(t('joined'), 'вход до перенумерации'));
        }
        middle.send({ t: 'leave' });
        middle.send({ t: 'ping' });
        await middle.take(t('pong'), 'выход из обычного лобби');
        await first.take(message => message.t === 'room' && message.players.length === 2
            && message.players.some(p => p.name === 'Оставшийся'), 'список после выхода');
        const replacement = await connect();
        replacement.send({ t: 'hello', room: code, name: 'Новый' });
        assert.equal((await replacement.take(t('joined'), 'новый участник')).seat, 2);
        await startParty([[first, 'адептус-механикус'], [last, 'имперская-гвардия'], [replacement, 'некроны']]);
        const views = await Promise.all([first, last, replacement].map((client, seat) =>
            client.take(message => message.t === 'state' && message.view.seat === seat, 'место игры после выхода ' + seat)));
        assert.deepEqual(views.map(message => message.view.players[message.view.seat].name), ['Первый', 'Оставшийся', 'Новый']);
        const setup = views[0].view.setup, cell = setup.legalCells[0];
        first.send({ t: 'cmd', cmd: { type: 'placeSystemTile', tile: setup.hand[0], row: cell.row, col: cell.col } });
        await first.take(message => message.t === 'state' && message.view.undo === 1, 'ход после перенумерации');
        middle.send({ t: 'undo' });
        middle.send({ t: 'ping' });
        await middle.take(t('pong'), 'бывший участник обычной партии обработан');
        const returned = await connect();
        returned.send({ t: 'hello', room: code, name: 'Оставшийся', id: joins[2].id });
        assert.equal((await returned.take(t('joined'), 'возвращение перенумерованного места')).seat, 1);
        const state = await returned.take(message => message.t === 'state' && message.view.seat === 1, 'состояние перенумерованного места');
        assert.equal(state.view.undo, 1, 'покинувший лобби не отменил ход обычной партии');
        for (const client of [first, middle, last, replacement, returned]) await client.close();
    }

    const room = 'PRIVACY' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const a = await connect(), b = await connect(), c = await connect();
    const joins = [];
    for (const [client, name] of [[a, 'Мех'], [b, 'Защитник'], [c, 'Третий']]) {
        // A new player cannot choose the credential the server will trust later.
        client.send({ t: 'hello', room, name, id: name === 'Мех' ? 'chosen-by-client' : '' });
        joins.push(await client.take(t('joined'), 'присоединение ' + name));
    }
    assert.deepEqual(joins.map(join => join.seat), [0, 1, 2]);
    assert.equal(new Set(joins.map(join => join.id)).size, 3, 'секреты разных игроков различаются');
    assert.ok(joins.every(join => typeof join.id === 'string' && join.id.length >= 24), 'секреты непредсказуемы');
    assert.notEqual(joins[0].id, 'chosen-by-client', 'сервер не принимает секрет от нового игрока');
    const lobby = await c.take(message => message.t === 'room' && message.players.length === 3, 'список комнаты');
    for (const join of joins) assert.ok(!JSON.stringify(lobby).includes(join.id), 'секрет не входит в список комнаты');
    const publicId = lobby.players.find(player => player.seat === 0).id;
    assert.notEqual(publicId, joins[0].id, 'публичный id отличается от секрета');

    await startParty([[a, 'адептус-механикус'], [b, 'имперская-гвардия'], [c, 'некроны']]);
    const views = await Promise.all([a, b, c].map((client, seat) =>
        client.take(message => message.t === 'state' && message.view.seat === seat, 'состояние места ' + seat)));
    assert.ok(views.every(message => message.view.phase === 'setup'), 'началась настоящая сборка трёх игроков');
    assert.ok(!JSON.stringify(views[2]).includes(joins[0].id), 'чужой секрет отсутствует в игровом состоянии');
    assert.equal('hands' in views[2].view.setup, false, 'чужие скрытые тайлы не в состоянии третьего игрока');

    for (const stolen of [publicId, 'chosen-by-client', 'p1', [joins[0].id]]) {
        const intruder = await connect();
        intruder.send({ t: 'hello', room, name: 'Чужой', id: stolen });
        const rejected = await intruder.take(t('joined'), 'отказ чужому id');
        assert.equal(rejected.id, '', 'публичный, выбранный или нестроковый id не открывает место');
        await intruder.take(message => message.t === 'err', 'причина отказа');
        assert.ok(!intruder.messages.some(message => message.t === 'state'), 'чужой игрок не получил приватное состояние');
        await intruder.close();
    }

    const rejoined = await connect();
    rejoined.send({ t: 'hello', room, name: 'Мех', id: joins[0].id });
    const back = await rejoined.take(t('joined'), 'своё переподключение');
    const myView = await rejoined.take(message => message.t === 'state' && message.view.seat === 0, 'своё состояние');
    assert.equal(back.id, joins[0].id);
    assert.equal(back.seat, 0);
    assert.deepEqual(myView.view.setup.hand, views[0].view.setup.hand, 'переподключение восстанавливает свои тайлы');

    // The replaced socket may neither undo nor reclaim the seat with another
    // hello; an old close must not detach the newly connected player.
    a.send({ t: 'undo' });
    const stale = await a.take(message => message.t === 'err', 'отказ заменённому сокету');
    assert.match(stale.msg, /заменено/i);
    a.send({ t: 'hello', room, name: 'Старый', id: joins[0].id });
    await a.take(message => message.t === 'err' && /заменено/i.test(message.msg), 'старый сокет не возвращает место');
    await a.close();
    await delay(50);

    const setup = myView.view.setup;
    assert.equal(setup.turn, 0);
    assert.equal(setup.stage, 'tile');
    const cell = setup.legalCells[0];
    const command = { type: 'placeSystemTile', tile: setup.hand[0], row: cell.row, col: cell.col };
    c.send({ t: 'cmd', cmd: command });
    await c.take(message => message.t === 'err', 'чужой ход отклонён');
    rejoined.send({ t: 'cmd', cmd: command });
    const ownerAdvance = await rejoined.take(message => message.t === 'err'
        || (message.t === 'state' && message.view.undo === 1), 'ход после переподключения');
    assert.equal(ownerAdvance.t, 'state', 'новый сокет не отключился после закрытия старого: ' + (ownerAdvance.msg || ''));
    const otherAdvances = await Promise.all([b, c].map((client, seat) =>
        client.take(message => message.t === 'state' && message.view.undo === 1, 'ход для места ' + (seat + 1))));
    assert.deepEqual([ownerAdvance, ...otherAdvances].map(message => message.view.seat), [0, 1, 2],
        'обновление пришло всем своим местам');

    // The normal same-socket rename uses hello too and must keep working.
    rejoined.send({ t: 'hello', room, name: 'Мех снова', id: joins[0].id });
    const renamed = await rejoined.take(t('joined'), 'переименование');
    assert.equal(renamed.id, joins[0].id);
    assert.equal(renamed.seat, 0);

    // Leaving an ongoing party disconnects this socket but reserves its seat:
    // it may not undo the owner's last move, and the secret can reconnect it.
    b.send({ t: 'leave' });
    b.send({ t: 'undo' });
    b.send({ t: 'ping' });
    await b.take(t('pong'), 'вышедший из партии сокет обработан');
    const bBack = await connect();
    bBack.send({ t: 'hello', room, name: 'Защитник', id: joins[1].id });
    const secondJoin = await bBack.take(t('joined'), 'возвращение после выхода из партии');
    const secondView = await bBack.take(message => message.t === 'state' && message.view.seat === 1, 'место после выхода');
    assert.equal(secondJoin.id, joins[1].id, 'место оставлено для переподключения');
    assert.equal(secondView.view.undo, 1, 'сокет после выхода не отменил ход');
    bBack.send({ t: 'undo' });
    await bBack.take(message => message.t === 'state' && message.view.undo === 0, 'вернувшийся участник отменяет ход');

    await delay(25);
    for (const join of joins) assert.ok(!server.output().includes(join.id), 'диагностический журнал не раскрывает секрет');
    console.log('  LAN: закрытые id, отказ подмене места и бота, соло-тесты, лобби («Готов»/«Начать игру», смена фракции, уборка молчащего места), выход, три приватных состояния и переподключение — без ошибок.');
} catch (error) {
    console.error('  LAN: FAIL — ' + (error && error.stack || error));
    process.exitCode = 1;
} finally {
    for (const client of clients) client.socket.destroy();
    if (server) {
        server.child.stdin.write('q\n');
        await Promise.race([new Promise(resolve => server.child.once('exit', resolve)), delay(2000)]);
        if (server.child.exitCode === null) server.child.kill('SIGTERM');
    }
}
