// dice.js — the big die in the middle of the screen.
//
// Two situations show it:
//   * the engine asks the acting player to roll (prompt.kind === 'dice'): everyone sees the die,
//     the acting player clicks it;
//   * a roll result arrived (view.lastRoll.n changed): the die tumbles for a moment on every
//     screen and then lands on the result.
// The die is a CSS 3D cube; during the tumble its faces cycle through the possible values.
const NOISE_FACES = ['1', '2', '3', '4', 'Тишина', 'Опасность', 'Встреча'];
const COMBAT_FACES = ['КРИТ', '2', '3', '4', '5', '6'];
const ROLL_MS = 1100, SHOW_MS = 1800;

function faceText(die, v) {
    if (v === 'crit') return 'КРИТ';
    if (v === 'silence') return 'Тишина';
    if (v === 'danger') return 'Опасность';
    if (v === 'encounter') return 'Встреча';
    return String(v);
}
function dieTitle(die) { return die === 'noise' ? 'Кубик шума' : 'Боевой кубик'; }

export class DiceUI {
    constructor(el, onRoll) {
        this.el = el; this.onRoll = onRoll;
        this.lastSeen = null; this.rolling = false; this.pendingResult = null; this.hideTimer = null; this.spinTimer = null;
        el.innerHTML = '<div class="dice-title"></div><div class="dice-stage"><div class="cube">' +
            ['f', 'b', 'r', 'l', 't', 'd'].map(c => '<div class="face ' + c + '"></div>').join('') + '</div></div><div class="dice-hint"></div>';
        this.cube = el.querySelector('.cube'); this.title = el.querySelector('.dice-title'); this.hint = el.querySelector('.dice-hint');
        this.faces = [...el.querySelectorAll('.face')];
        this.cube.onclick = () => { if (this.clickable) { this.clickable = false; this.startSpin(); this.onRoll(); } };
    }

    /** Called on every state update. */
    update(view, me, playerName) {
        const pr = view.prompt;
        const roll = view.lastRoll;
        if (this.lastSeen === null) this.lastSeen = roll ? roll.n : 0;   // nothing to replay on (re)connect
        if (roll && roll.n !== this.lastSeen) {
            this.lastSeen = roll.n;
            this.showResult(roll, playerName(roll.player));
        }
        const dicePrompt = pr && pr.kind === 'dice';
        if (dicePrompt && !this.rolling) {
            this.clearHide();
            const mine = !pr.waiting && pr.player === me;
            this.setDie(pr.die);
            this.title.textContent = pr.title || dieTitle(pr.die);
            this.hint.textContent = mine ? 'Нажмите на кубик, чтобы бросить' : playerName(pr.player) + ' бросает ' + dieTitle(pr.die).toLowerCase() + '…';
            this.el.classList.toggle('mine', mine); this.clickable = mine;
            this.setFaces(pr.die, null);
            this.show();
        } else if (!dicePrompt && !this.rolling && !this.hideTimer) this.hide();
    }

    setDie(die) { this.die = die; this.el.classList.toggle('combat', die === 'combat'); this.el.classList.toggle('noise', die === 'noise'); }
    show() { this.el.classList.remove('hidden'); }
    hide() { this.el.classList.add('hidden'); this.el.classList.remove('mine', 'landed'); this.clickable = false; }
    clearHide() { if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } }

    /** Fill the six faces; `result` (if given) goes on the front face. */
    setFaces(die, result) {
        const pool = die === 'noise' ? NOISE_FACES : COMBAT_FACES;
        this.faces.forEach((f, i) => { const t = i === 0 && result != null ? result : pool[(i * 2 + Math.floor(Math.random() * pool.length)) % pool.length]; f.textContent = t; f.classList.toggle('long', t.length > 2); });
    }

    startSpin() {
        this.rolling = true; this.clearHide();
        this.el.classList.remove('landed'); this.el.classList.add('spinning');
        this.show();
        this.hint.textContent = 'Бросок…';
        this.spinTimer = setInterval(() => this.setFaces(this.die, null), 90);
        this.spinStarted = performance.now();
        setTimeout(() => this.finishSpin(), ROLL_MS);
    }
    finishSpin() {
        clearInterval(this.spinTimer); this.spinTimer = null;
        this.el.classList.remove('spinning');
        this.rolling = false;
        if (this.pendingResult) { const r = this.pendingResult; this.pendingResult = null; this.land(r.roll, r.who); }
        else this.hint.textContent = 'Ждём результат…';
    }
    /** A result arrived: if the actor's own spin is running, land when it ends; otherwise spin first. */
    showResult(roll, who) {
        if (this.rolling) { this.pendingResult = { roll, who }; return; }
        this.setDie(roll.die);
        this.title.textContent = dieTitle(roll.die) + (who ? ' — ' + who : '');
        this.pendingResult = { roll, who };
        this.startSpin();
    }
    land(roll, who) {
        this.setDie(roll.die);
        this.setFaces(roll.die, faceText(roll.die, roll.value));
        this.title.textContent = dieTitle(roll.die) + (who ? ' — ' + who : '');
        this.hint.textContent = 'Результат: ' + faceText(roll.die, roll.value);
        this.el.classList.add('landed');
        this.clearHide();
        this.hideTimer = setTimeout(() => { this.hideTimer = null; this.hide(); if (this.afterHide) this.afterHide(); }, SHOW_MS);
    }
}
