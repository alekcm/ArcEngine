// FSNet.js — the client half of the LAN protocol.
//
// The server (tools/fs-server.mjs) owns the game: the client sends commands
// and receives the new state. Everything is JSON over a WebSocket.
//
//   FSNet.connect({ room, name, id }) -> net
//   net.on('joined' | 'room' | 'state' | 'err', fn)
//   net.cmd({ type: 'placeOrder', … })     — a command of the rules engine
//   net.faction('некроны')                  — the choice of the faction
//
// The room code and the player name come from the link:
//   http://<host>:8080/?room=ABCD&name=Аня
// so the host only has to send the link to the friends.

/** @satisfies {Record<string, any>} */
const FSNet = {
    RETRY_SEC: 3,           // s: how often the connection is restored after a break

    /** @param {{room?:string, name?:string, id?:string}} opts */
    connect(opts) {
        const o = opts || {};
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = proto + '//' + location.host + '/ws';
        const handlers = new Map();
        const net = {
            handlers,
            ws: null,
            connected: false,
            room: o.room || '',
            name: o.name || '',
            id: o.id || '',
            on(type, fn) {
                if (!handlers.has(type)) handlers.set(type, []);
                handlers.get(type).push(fn);
                return net;
            },
            emit(type, data) {
                for (const fn of handlers.get(type) || []) fn(data);
            },
            send(msg) {
                if (!net.ws || net.ws.readyState !== WebSocket.OPEN) return false;
                net.ws.send(JSON.stringify(msg));
                return true;
            },
            cmd(cmd) {
                return net.send({ t: 'cmd', cmd });
            },
            faction(faction) {
                return net.send({ t: 'faction', faction });
            },
            rename(name) {
                net.name = String(name || '').trim().slice(0, 24);
                // The hello message for the existing id updates the lobby name on the server.
                return net.send({ t: 'hello', room: net.room, name: net.name, faction: '', id: net.id });
            },
        };

        // The connection: it is restored if the server is restarted.
        let stopped = false;
        const open = () => {
            const ws = net.ws = new WebSocket(url);
            ws.onopen = () => {
                net.connected = true;
                net.send({ t: 'hello', room: net.room, name: net.name, faction: '', id: net.id });
            };
            ws.onclose = () => {
                net.connected = false;
                net.emit('close', null);
                if (stopped) return;
                setTimeout(open, FSNet.RETRY_SEC * 1000);
            };
            ws.onerror = () => net.emit('err', 'Нет связи с сервером.');
            ws.onmessage = ev => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                if (!msg || !msg.t) return;
                if (msg.t === 'joined') {
                    net.id = msg.id;
                    net.room = msg.room;
                    net.emit('joined', msg);
                    return;
                }
                net.emit(msg.t, msg);
            };
        };
        open();
        net.stop = () => { stopped = true; if (net.ws) net.ws.close(); };
        return net;
    },
};
