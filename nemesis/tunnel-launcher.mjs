// Runs Cloudflare Quick Tunnel and publishes its temporary join URL to the local game lobby.
import { spawn } from 'node:child_process';
import http from 'node:http';

const executable = process.argv[2];
const port = Number(process.argv[3] || 18090);
if (!executable || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Usage: node tunnel-launcher.mjs <cloudflared.exe> <local-port>');
    process.exit(2);
}

function publish(url) {
    return new Promise(resolve => {
        const body = JSON.stringify({ url });
        const req = http.request({ hostname: '127.0.0.1', port, path: '/api/tunnel', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
            res.resume(); res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
        });
        req.on('error', () => resolve(false));
        req.end(body);
    });
}

// Force HTTP/2 over TCP: QUIC/UDP is commonly blocked by VPNs and firewalls, which can
// leave a Quick Tunnel URL allocated at Cloudflare but unable to reach this origin.
const child = spawn(executable, ['tunnel', '--no-autoupdate', '--ha-connections', '4', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`],
    { stdio: ['inherit', 'pipe', 'pipe'], windowsHide: false });
let published = '';
let pendingUrl = '';
let tunnelReady = false;
let lineBuffers = ['', ''];
function relay(stream, index, target) {
    stream.on('data', chunk => {
        const text = chunk.toString();
        target.write(text);
        lineBuffers[index] = (lineBuffers[index] + text).slice(-4096);
        const match = lineBuffers[index].match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) pendingUrl = match[0];
        if (/Registered tunnel connection/.test(lineBuffers[index])) tunnelReady = true;
        // Cloudflare prints the URL before an edge connection is registered. Do not expose an
        // invite while it would immediately produce a 502/520 page.
        if (!tunnelReady || !pendingUrl || pendingUrl === published) return;
        published = pendingUrl;
        console.log('\n\x1b[96mТуннель подключён. Ссылка для игры: ' + published + '\x1b[0m\n');
        publish(published).then(ok => {
            if (!ok) console.error('Не удалось передать ссылку в лобби. Откройте её из вывода выше вручную.');
        });
    });
}
relay(child.stdout, 0, process.stdout);
relay(child.stderr, 1, process.stderr);
child.on('error', err => { console.error('Не удалось запустить cloudflared:', err.message); process.exitCode = 1; });
child.on('close', async code => {
    await publish('');
    process.exitCode = code || 0;
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
