// sound.js — procedural sound effects (WebAudio, no asset files).
//
// Everything is synthesised from oscillators and filtered noise, so the game stays dependency-free.
// The context is created lazily on the first user gesture (browser autoplay policy).
const SOUND_KEY = 'nemesis.sound';

let ctx = null, master = null, noiseBuf = null, muted = localStorage.getItem(SOUND_KEY) === 'off';
let stepTimer = 0;

function ac() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
}
export function unlock() { const c = ac(); if (c && c.state === 'suspended') c.resume(); }
export function isMuted() { return muted; }
export function setMuted(m) { muted = m; localStorage.setItem(SOUND_KEY, m ? 'off' : 'on'); if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ac().currentTime, 0.02); }

function env(node, t, a, d, peak = 1, sustain = 0) {
    node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, a = 0.005, sweepTo = null } = {}) {
    const c = ac(); if (!c) return;
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(freq, t); flt.Q.value = q;
    if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); env(g, t, a, dur, gain);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
}
function tone(t, dur, { type = 'sine', freq = 440, to = null, gain = 0.3, a = 0.01, detune = 0 } = {}) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); env(g, t, a, dur, gain);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

const FX = {
    /** quick riffle of a card deck */
    shuffle(t) { for (let i = 0; i < 9; i++) noise(t + i * 0.035, 0.03, { freq: 2600 + i * 150, q: 2, gain: 0.25 }); },
    /** one card dealt / slapped on the table */
    card(t) { noise(t, 0.06, { freq: 1800, q: 1.5, gain: 0.3, sweepTo: 600 }); noise(t + 0.04, 0.05, { type: 'lowpass', freq: 500, gain: 0.25 }); },
    /** a card is flipped face up */
    flip(t) { noise(t, 0.12, { freq: 900, q: 1, gain: 0.22, sweepTo: 3000 }); },
    /** dice tumbling on the table then settling */
    dice(t) { for (let i = 0; i < 7; i++) { const dt = i * i * 0.028 + i * 0.05; tone(t + dt, 0.05, { type: 'square', freq: 1200 - i * 90, to: 500, gain: 0.08 }); noise(t + dt, 0.04, { freq: 3000, q: 3, gain: 0.3 - i * 0.03 }); } },
    /** a footstep (called repeatedly while a figure runs) */
    step(t) { noise(t, 0.07, { type: 'lowpass', freq: 320, gain: 0.5 }); tone(t, 0.06, { freq: 110, to: 60, gain: 0.15 }); },
    /** gunshot */
    shot(t) { noise(t, 0.25, { type: 'lowpass', freq: 2500, gain: 1.0, sweepTo: 200 }); tone(t, 0.18, { type: 'triangle', freq: 150, to: 40, gain: 0.5 }); noise(t + 0.02, 0.4, { freq: 700, q: 0.7, gain: 0.25 }); },
    /** intruder roar */
    roar(t) { tone(t, 0.9, { type: 'sawtooth', freq: 70, to: 140, gain: 0.35, a: 0.08 }); tone(t, 0.9, { type: 'sawtooth', freq: 73, to: 150, gain: 0.3, a: 0.08, detune: 30 }); noise(t, 0.9, { freq: 600, q: 0.6, gain: 0.35, sweepTo: 250 }); },
    /** self-destruct siren (only when it is started) */
    siren(t) { for (let i = 0; i < 3; i++) { tone(t + i * 0.9, 0.45, { type: 'square', freq: 520, to: 880, gain: 0.12 }); tone(t + i * 0.9 + 0.45, 0.45, { type: 'square', freq: 880, to: 520, gain: 0.12 }); } },
    /** short reminder while the self-destruct is counting */
    beep(t) { tone(t, 0.1, { type: 'square', freq: 1046, gain: 0.1 }); tone(t + 0.16, 0.1, { type: 'square', freq: 1046, gain: 0.1 }); },
    /** taking damage */
    hurt(t) { noise(t, 0.2, { type: 'lowpass', freq: 400, gain: 0.8 }); tone(t, 0.25, { freq: 90, to: 35, gain: 0.4 }); },
    /** contamination: eerie detuned chord */
    contam(t) { tone(t, 0.9, { type: 'triangle', freq: 220, gain: 0.12, a: 0.1 }); tone(t, 0.9, { type: 'triangle', freq: 233, gain: 0.12, a: 0.1 }); tone(t + 0.1, 0.8, { type: 'sine', freq: 440, to: 300, gain: 0.08, a: 0.1 }); },
    /** rummaging in the intruder bag */
    bag(t) { for (let i = 0; i < 6; i++) noise(t + i * 0.07, 0.06, { freq: 1200 + (i % 3) * 400, q: 1.2, gain: 0.2 }); tone(t + 0.5, 0.08, { type: 'square', freq: 900, gain: 0.06 }); },
    /** room tile flipping over */
    tile(t) { noise(t, 0.35, { freq: 400, q: 0.8, gain: 0.3, sweepTo: 1800 }); tone(t + 0.3, 0.12, { type: 'triangle', freq: 180, to: 90, gain: 0.2 }); },
    /** UI click */
    click(t) { tone(t, 0.04, { type: 'square', freq: 1500, gain: 0.05 }); },
    /** ping (Tab) */
    ping(t) { tone(t, 0.3, { type: 'sine', freq: 880, to: 1320, gain: 0.12 }); tone(t + 0.1, 0.3, { type: 'sine', freq: 1320, gain: 0.08 }); },
    /** a card burned out of the game */
    burn(t) { noise(t, 0.6, { freq: 1500, q: 0.5, gain: 0.3, sweepTo: 300, a: 0.1 }); },
};

/** Play a named effect (ignored when audio is unavailable). */
export function play(name, delayMs = 0) {
    const c = ac(); if (!c || !FX[name]) return;
    if (c.state === 'suspended') return;
    FX[name](c.currentTime + delayMs / 1000);
}
/** Footsteps throttled to a running cadence; call every frame while something runs. */
export function footstep(nowMs) { if (nowMs - stepTimer > 260) { stepTimer = nowMs; play('step'); } }
