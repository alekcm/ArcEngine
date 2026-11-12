// Direct browser-to-browser play through WebRTC. Signaling (offer/answer) is copied manually;
// no game relay server is used. STUN helps ICE discover direct paths; there is deliberately no TURN.
export class NemesisP2P {
    constructor({ role, onMessage, onStatus }) {
        this.role = role;
        this.onMessage = onMessage;
        this.onStatus = onStatus;
        this.pc = null;
        this.channel = null;
        this.bridge = null;
        this.pending = [];
        this.pendingFromServer = [];
        this.closed = false;
    }
    setStatus(text) { if (this.onStatus) this.onStatus(text); }
    peer() {
        if (this.pc) return this.pc;
        this.pc = new RTCPeerConnection({ iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
        ] });
        this.pc.oniceconnectionstatechange = () => {
            const s = this.pc.iceConnectionState;
            if (s === 'checking') this.setStatus('Проверяем прямой P2P-маршрут…');
            else if (s === 'connected' || s === 'completed') this.setStatus('Прямое P2P-соединение установлено.');
            else if (s === 'failed') this.setStatus('P2P не пробился через NAT/VPN (ICE failed). Эта сеть может требовать TURN-релей.');
            else if (s === 'disconnected') this.setStatus('P2P-соединение временно потеряно; ожидаем восстановления…');
            else if (s === 'closed') this.setStatus('P2P-соединение закрыто.');
        };
        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === 'failed') this.setStatus('Браузер не смог установить прямое соединение. Проверьте, что VPN разрешает UDP/WebRTC.');
        };
        this.pc.ondatachannel = e => this.attachChannel(e.channel);
        return this.pc;
    }
    attachChannel(channel) {
        this.channel = channel;
        channel.onopen = () => {
            this.setStatus('P2P-канал открыт; подключаемся к партии…');
            if (this.role === 'guest') this.send({ t: 'join', token: localStorage.getItem('nemesis.token'), name: localStorage.getItem('nemesis.name') || '' });
            else for (const data of this.pendingFromServer.splice(0)) channel.send(data);
        };
        channel.onmessage = e => {
            if (this.role === 'host') {
                try {
                    JSON.parse(e.data); // validate that only protocol JSON is bridged
                    if (this.bridge && this.bridge.readyState === WebSocket.OPEN) this.bridge.send(e.data);
                    else this.pending.push(e.data);
                } catch (err) { console.error('Некорректное сообщение P2P:', err); }
                return;
            }
            try { this.onMessage(JSON.parse(e.data)); }
            catch (err) { console.error('Некорректное сообщение P2P:', err); }
        };
        channel.onclose = () => this.setStatus('P2P-канал закрыт.');
        channel.onerror = () => this.setStatus('Ошибка передачи по P2P-каналу.');
    }
    send(obj) {
        const data = JSON.stringify(obj);
        if (this.role === 'guest') {
            if (!this.channel || this.channel.readyState !== 'open') return false;
            this.channel.send(data); return true;
        }
        if (!this.bridge || this.bridge.readyState !== WebSocket.OPEN) { this.pending.push(data); return false; }
        this.bridge.send(data); return true;
    }
    async gather() {
        if (this.pc.iceGatheringState === 'complete') return;
        this.setStatus('Собираем ICE-кандидаты STUN; подождите…');
        await new Promise((resolve, reject) => {
            // Some VPNs/STUN endpoints never signal gathering complete. Use the candidates
            // collected so far rather than leaving the invite flow stuck indefinitely.
            const timer = setTimeout(() => { cleanup(); resolve(); }, 8000);
            const check = () => { if (this.pc.iceGatheringState === 'complete') { cleanup(); resolve(); } };
            const cleanup = () => { clearTimeout(timer); this.pc.removeEventListener('icegatheringstatechange', check); };
            this.pc.addEventListener('icegatheringstatechange', check); check();
        });
    }
    async createOffer() {
        if (this.role !== 'host') throw new Error('Only host creates the offer');
        const pc = this.peer();
        if (pc.signalingState !== 'stable') throw new Error('Сначала завершите или перезапустите предыдущую попытку P2P.');
        this.attachChannel(pc.createDataChannel('nemesis-game', { ordered: true }));
        this.hostBridge();
        await pc.setLocalDescription(await pc.createOffer());
        await this.gather();
        this.setStatus('Приглашение готово. Передайте его другу и вставьте его ответ ниже.');
        return JSON.stringify(pc.localDescription);
    }
    async createAnswer(offerText) {
        if (this.role !== 'guest') throw new Error('Only guest creates an answer');
        const pc = this.peer();
        const offer = JSON.parse(offerText);
        if (!offer || offer.type !== 'offer' || typeof offer.sdp !== 'string') throw new Error('Вставьте полное приглашение ведущего.');
        await pc.setRemoteDescription(offer);
        await pc.setLocalDescription(await pc.createAnswer());
        await this.gather();
        this.setStatus('Ответ готов. Отправьте его ведущему; после подключения канал свяжется сам.');
        return JSON.stringify(pc.localDescription);
    }
    async applyAnswer(answerText) {
        if (this.role !== 'host') throw new Error('Only host applies the answer');
        const answer = JSON.parse(answerText);
        if (!answer || answer.type !== 'answer' || typeof answer.sdp !== 'string') throw new Error('Вставьте полный ответ друга.');
        await this.peer().setRemoteDescription(answer);
        this.setStatus('Ответ принят; выполняется проверка прямого соединения…');
    }
    hostBridge() {
        if (this.role !== 'host' || this.bridge) return;
        const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        this.bridge = new WebSocket(proto + location.host + '/ws');
        this.bridge.onopen = () => {
            this.setStatus('Связь с игровым сервером есть; ждём гостя по P2P…');
            for (const data of this.pending.splice(0)) this.bridge.send(data);
        };
        this.bridge.onmessage = e => {
            if (this.channel && this.channel.readyState === 'open') this.channel.send(e.data);
            else this.pendingFromServer.push(e.data);
        };
        this.bridge.onerror = () => this.setStatus('Не удалось открыть второй канал к игровому серверу.');
        this.bridge.onclose = () => { if (!this.closed) this.setStatus('Канал гостя к игровому серверу закрыт.'); };
        this.pc.ondatachannel = e => {
            this.attachChannel(e.channel);
            this.hostBridge();
        };
        this.setStatus('Готово приглашение; после ответа друга сервер добавит его отдельным игроком.');
    }
    close() {
        this.closed = true;
        if (this.bridge) this.bridge.close();
        if (this.pc) this.pc.close();
        this.setStatus('P2P-соединение закрыто.');
    }
}
