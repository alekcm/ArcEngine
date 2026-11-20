// Procedural sound (WebAudio): no audio files. sfx(name) plays a short synthesized effect.
import { Store } from './store.js';

let ctx = null, master = null;
let muted = Store.get('mute', false);
export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; Store.set('mute', muted); }

function ac() {
    if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
        master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}
function noise(dur) {
    const c = ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, t, dur, peak = 0.3) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function burst(t, dur, freq, q, peak = 0.4, type = 'bandpass') {
    const s = noise(dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.004, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}

const FX = {
    click: (t) => tone('triangle', 900, 600, t, 0.05, 0.12),
    card: (t) => burst(t, 0.12, 2400, 1.2, 0.35, 'highpass'),
    draw: (t) => { burst(t, 0.09, 3000, 1, 0.25, 'highpass'); burst(t + 0.07, 0.09, 2600, 1, 0.2, 'highpass'); },
    coin: (t) => { tone('sine', 2100, 2000, t, 0.25, 0.18); tone('sine', 2650, 2600, t + 0.06, 0.3, 0.14); },
    step: (t) => { burst(t, 0.07, 400, 2, 0.4, 'lowpass'); burst(t + 0.18, 0.07, 350, 2, 0.35, 'lowpass'); },
    sword: (t) => { burst(t, 0.25, 5000, 3, 0.35); tone('sawtooth', 1800, 500, t, 0.18, 0.06); },
    hit: (t) => { tone('sine', 140, 50, t, 0.25, 0.6); burst(t, 0.12, 900, 1, 0.4, 'lowpass'); },
    shield: (t) => { tone('triangle', 520, 520, t, 0.35, 0.14); tone('triangle', 780, 780, t + 0.01, 0.35, 0.09); },
    roar: (t) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), l = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.9);
        l.frequency.value = 23; lg.gain.value = 25; l.connect(lg); lg.connect(o.frequency);
        f.type = 'lowpass'; f.frequency.value = 700; env(g, t, 0.05, 0.4, 0.9);
        o.connect(f); f.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1);
        burst(t, 0.8, 300, 0.8, 0.25, 'lowpass');
    },
    dice: (t) => { for (let i = 0; i < 7; i++) burst(t + i * 0.055 + Math.random() * 0.03, 0.04, 1800 + Math.random() * 1600, 4, 0.35); },
    turn: (t) => { tone('sine', 523, 0, t, 0.25, 0.16); tone('sine', 784, 0, t + 0.12, 0.4, 0.16); },
    win: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, t + i * 0.13, 0.5, 0.2)); },
    lose: (t) => { [392, 330, 262].forEach((f, i) => tone('triangle', f, 0, t + i * 0.18, 0.5, 0.18)); },
    trophy: (t) => { [659, 880, 1175].forEach((f, i) => tone('sine', f, 0, t + i * 0.09, 0.6, 0.16)); burst(t, 0.6, 6000, 2, 0.08); },
    elixir: (t) => { for (let i = 0; i < 5; i++) tone('sine', 300 + Math.random() * 500, 900, t + i * 0.06, 0.12, 0.08); },
    error: (t) => tone('square', 180, 140, t, 0.16, 0.08),
};
export function sfx(name, delay = 0) {
    if (muted) return;
    const c = ac(); if (!c || !FX[name]) return;
    try { FX[name](c.currentTime + 0.01 + delay); } catch { /* audio is best effort */ }
}
