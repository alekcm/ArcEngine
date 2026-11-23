// ============================================================================
//  The Nemesis board game has exactly one entrance: its LAN server
// ----------------------------------------------------------------------------
//  nemesis/server.mjs (nemesis.bat) serves the client AND speaks the WebSocket
//  at /ws, which is the only transport of the game (local network or localhost
//  on the same machine).
//
//  The kit's dev server (run.bat) and the editor (editor.bat) serve the whole
//  project root, so /nemesis/client/ is reachable from them as well — but
//  neither has /ws and neither injects the build stamp. Opening the game there
//  renders the lobby and then loops on "Связь с сервером потеряна", which looks
//  like a broken game. Both servers answer the game PAGE with a 403 note that
//  says how to start it; the client's modules (scene3d.js, tuning.js and the
//  art) stay available — the editor's Nemesis tab imports them.
// ============================================================================

export const NEMESIS_GAME_PATHS = ['/nemesis/client', '/nemesis/client/index.html'];

/** Is this request for the game page itself?
 *  Case-insensitive: a Windows checkout keeps the folder as "Nemesis/", a Linux one uses
 *  "nemesis/" — same directory, two spellings in git. The path is normalised, so "/nemesis//client/",
 *  "/nemesis/client/./index.html" and an encoded ".." cannot slip the page past the guard; trailing
 *  dots and spaces are dropped because Windows opens "index.html." as "index.html". */
export function isNemesisGamePage(pathname) {
    const parts = [];
    for (const part of String(pathname || '').toLowerCase().replace(/\\/g, '/').split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { parts.pop(); continue; }
        parts.push(part.replace(/[. ]+$/, ''));
    }
    return NEMESIS_GAME_PATHS.includes('/' + parts.join('/'));
}

/** The one answer both servers give: plain HTML, no scripts, no assets to load. */
export function nemesisLanOnlyPage() {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Nemesis — только по локальной сети</title>
<style>
    html, body { margin: 0; height: 100%; background: #070b10; color: #d8e1ea;
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { display: flex; align-items: center; justify-content: center; padding: 24px; }
    .box { width: min(620px, 96vw); background: rgba(20, 28, 40, 0.95); border: 1px solid #26354a;
        border-radius: 12px; padding: 28px 32px; box-shadow: 0 20px 60px #000a; }
    h1 { margin: 0 0 16px; letter-spacing: 6px; font-weight: 800; color: #fff; font-size: 26px; }
    h1 span { font-weight: 300; letter-spacing: 2px; color: #ffb347; font-size: 0.75em; }
    p { margin: 10px 0; line-height: 1.55; }
    code { background: #0b1118; border: 1px solid #26354a; border-radius: 5px; padding: 2px 6px; color: #ffb347; }
    .addr { color: #8a99ab; }
    .src { margin-top: 18px; padding-top: 12px; border-top: 1px solid #26354a; color: #8a99ab; font-size: 12px; }
</style>
</head>
<body>
<div class="box">
    <h1>NEMESIS <span>Redux</span></h1>
    <p><b>Игра подключается только по локальной сети.</b> Запустите <b>nemesis.bat</b>
        (или <b>nemesis\\nemesis.bat</b>) и откройте адрес, который он напечатает:</p>
    <p class="addr">на этом компьютере — <code>http://localhost:8090</code><br>
        для друзей — <code>http://&lt;ваш IP в локальной сети&gt;:8090</code></p>
    <p class="src">Эта страница открыта dev-сервером набора или редактором — у них нет игрового
        сокета <code>/ws</code>. Остальные серверы к игре не подключаются.</p>
</div>
</body>
</html>
`;
}
