// Shared client context: connection, latest server message, small UI helpers.
import { Store } from './store.js';
import { sfx } from './sound.js';

export const $ = (id) => document.getElementById(id);
export const S = {
    ws: null, token: Store.get('token', null), name: Store.get('name', ''),
    you: -1, host: false, lobby: null, view: null, options: null, undo: null, chat: [],
    build: null, board: null, ui: { rowOpen: false, sel: [], pay: null, combo: [], fightSnap: null, fightResult: null, pokerSnap: null, tab: 'log' },
    rerender: () => {},
};

export function send(msg) {
    if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg));
}
export function cmd(c, label) {
    sfx('click');
    send({ t: 'cmd', cmd: c, label });
}
export const me = () => (S.view && S.you >= 0 ? S.view.players[S.you] : null);
export const myTurn = () => !!(S.options && S.options.acting);

export function toast(text, kind = 'err') {
    const box = $('toast');
    const d = document.createElement('div');
    d.className = kind; d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), kind === 'err' ? 3800 : 2600);
    if (kind === 'err') sfx('error');
}
let bannerTimer = null;
export function banner(title, sub = '', ms = 1600) {
    const b = $('banner');
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}
/** Button markup; a disabled button carries its reason in a hover tooltip (on a wrapper,
 *  because disabled buttons do not receive pointer events everywhere). */
export function btn({ id, label, why = null, primary = false, small = false, icon = '', key = '', data = '' }) {
    const b = `<button class="btn ${primary ? 'primary' : ''} ${small ? 'small' : ''}" ${id ? `id="${id}"` : ''} ${data} ${why ? 'disabled' : ''}>${icon}${label}${key ? ` <kbd>${key}</kbd>` : ''}</button>`;
    return why ? `<span class="whywrap" data-why="${String(why).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${b}</span>` : b;
}
