// make-sounds.mjs — the kit's synthesized sounds in assets/sounds/, built from numbers:
//   step.wav   — a footstep: a short thump with a gritty tail
//   gallop.wav — a double horse hoofbeat for hero movement on the adventure map
//   sword.wav  — metallic blade clash and body impact for melee combat
//   arrow.wav  — bowstring snap and air whoosh for ranged shots
//   magic.wav  — shimmering crystalline chord for spells, shrines and level-ups
//   gold.wav   — bright coin cascade for chests, mines and recruitment
//   horn.wav   — heroic brass fifth fanfare for battle start and new week
//   click.wav  — crisp medieval stone/wood UI tap
// Generated — no source file, no licence questions. Other files in assets/sounds are left alone.
//
//   node tools/make-sounds.mjs          # writes the files
//   node tools/make-sounds.mjs --check  # exit 1 if a file on disk differs
//
// WAV: PCM 16 bit, mono, 22050 Hz — small files, plenty for effects.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sounds');
const RATE = 22050;

// White noise −1..1 from a seed: the same bytes on every run (a plain LCG, 32 bit).
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

// One-pole low-pass: k 0..1, smaller — duller.
function lowpass(k) {
  let y = 0;
  return (x) => (y += k * (x - y));
}

// A footstep, 0.14 s: a sine thump sliding 110 -> 55 Hz plus dull noise, both dying fast.
function step() {
  const n = Math.round(RATE * 0.14), out = new Float64Array(n);
  const rnd = noise(7), lp = lowpass(0.25);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += 2 * Math.PI * (55 + 55 * Math.exp(-t * 40)) / RATE;
    const attack = Math.min(1, t / 0.004);
    out[i] = attack * (0.8 * Math.sin(phase) * Math.exp(-t * 38) + 0.5 * lp(rnd()) * Math.exp(-t * 55));
  }
  return out;
}

// Double horse hoofbeat ("clip-clop"), 0.24 s.
function gallop() {
  const n = Math.round(RATE * 0.24), out = new Float64Array(n);
  const rnd = noise(19), lp1 = lowpass(0.32), lp2 = lowpass(0.28);
  const hit = (t, f0, lp) => {
    if (t < 0) return 0;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 48);
    const body = Math.sin(2 * Math.PI * (f0 + 90 * Math.exp(-t * 55)) * t);
    return env * (0.65 * body + 0.55 * lp(rnd()));
  };
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = 0.85 * (hit(t, 135, lp1) + 0.9 * hit(t - 0.095, 112, lp2));
  }
  return out;
}

// Metallic sword clang + low impact thud, 0.34 s.
function sword() {
  const n = Math.round(RATE * 0.34), out = new Float64Array(n);
  const rnd = noise(31), lp = lowpass(0.45);
  const partials = [780, 1240, 1890, 2630, 3410];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const atk = Math.min(1, t / 0.002);
    let ring = 0;
    for (let k = 0; k < partials.length; k++) {
      ring += Math.sin(2 * Math.PI * partials[k] * t) * Math.exp(-t * (14 + k * 5)) / partials.length;
    }
    const scrape = (rnd() - lp(rnd())) * Math.exp(-t * 36) * 0.55;
    const thud = Math.sin(2 * Math.PI * (95 + 60 * Math.exp(-t * 45)) * t) * Math.exp(-t * 28) * 0.55;
    out[i] = atk * Math.max(-0.98, Math.min(0.98, ring * 2.1 + scrape + thud));
  }
  return out;
}

// Bowstring twang + arrow flight whoosh, 0.28 s.
function arrow() {
  const n = Math.round(RATE * 0.28), out = new Float64Array(n);
  const rnd = noise(43), lp = lowpass(0.18);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += 2 * Math.PI * (190 - 65 * t) / RATE;
    const stringSnap = Math.sin(phase + 0.4 * Math.sin(2 * phase)) * Math.exp(-t * 24) * 0.55;
    const whooshEnv = Math.sin(Math.min(1, t / 0.22) * Math.PI) * Math.exp(-t * 6);
    const air = (rnd() - lp(rnd())) * whooshEnv * 0.65;
    out[i] = Math.min(1, t / 0.003) * (stringSnap + air);
  }
  return out;
}

// Shimmering crystalline arpeggio for spells and shrines, 0.62 s.
function magic() {
  const n = Math.round(RATE * 0.62), out = new Float64Array(n);
  const notes = [523.25, 659.25, 783.99, 987.77, 1318.51];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (let k = 0; k < notes.length; k++) {
      const dt = t - k * 0.055;
      if (dt <= 0) continue;
      const env = Math.min(1, dt / 0.008) * Math.exp(-dt * 5.2);
      const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 7 * dt);
      s += env * (0.7 * Math.sin(2 * Math.PI * notes[k] * vibrato * dt) +
                  0.3 * Math.sin(4 * Math.PI * notes[k] * vibrato * dt));
    }
    out[i] = Math.max(-0.95, Math.min(0.95, s * 0.34));
  }
  return out;
}

// Bright gold coin cascade, 0.42 s.
function gold() {
  const n = Math.round(RATE * 0.42), out = new Float64Array(n);
  const pings = [
    [0.00, 1760], [0.055, 2093], [0.105, 2637], [0.165, 3136],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const [t0, f] of pings) {
      const dt = t - t0;
      if (dt <= 0) continue;
      const env = Math.min(1, dt / 0.002) * Math.exp(-dt * 16);
      s += env * (0.75 * Math.sin(2 * Math.PI * f * dt) + 0.25 * Math.sin(2 * Math.PI * f * 2.41 * dt));
    }
    out[i] = Math.max(-0.95, Math.min(0.95, s * 0.48));
  }
  return out;
}

// Heroic brass warhorn fifth (D4 -> A4), 0.72 s.
function horn() {
  const n = Math.round(RATE * 0.72), out = new Float64Array(n);
  const brass = (t, f, dur) => {
    if (t <= 0 || t > dur + 0.18) return 0;
    const atk = Math.min(1, t / 0.035);
    const rel = t < dur ? 1 : Math.exp(-(t - dur) * 18);
    let h = 0;
    const amps = [1.0, 0.68, 0.45, 0.28, 0.16, 0.09];
    for (let k = 0; k < amps.length; k++) {
      h += amps[k] * Math.sin(2 * Math.PI * f * (k + 1) * t);
    }
    return atk * rel * h * 0.24;
  };
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = Math.max(-0.95, Math.min(0.95, brass(t, 293.66, 0.24) + brass(t - 0.20, 440.0, 0.38)));
  }
  return out;
}

// Crisp UI tap, 0.06 s.
function click() {
  const n = Math.round(RATE * 0.06), out = new Float64Array(n);
  const rnd = noise(91), lp = lowpass(0.35);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t * 95);
    out[i] = env * (0.7 * Math.sin(2 * Math.PI * 640 * t) + 0.35 * lp(rnd()));
  }
  return out;
}

// A looped ambience (wind, blades, a machine), seconds long: dull noise that swells twice per
// loop. The noise sequence and the swell are periodic over the loop, and the filter runs one
// loop ahead of the part that is kept — its state at the end equals its state at the start,
// so the loop point is inaudible.
export function loopedNoise(seconds = 2, seed = 11, cutoff = 0.06, gain = 3.2) {
  const n = Math.round(RATE * seconds), out = new Float64Array(n), seq = new Float64Array(n);
  const rnd = noise(seed), lp = lowpass(cutoff);
  for (let i = 0; i < n; i++) seq[i] = rnd();
  for (let i = 2 * n, k = 0; k < 2 * n; k++) {
    void i;
    const v = lp(seq[k % n]);
    if (k < n) continue;
    const swell = Math.sin(2 * Math.PI * (k - n) / n);
    out[k - n] = v * (0.35 + 0.65 * swell * swell) * gain;
  }
  return out;
}

// Samples −1..1 -> the bytes of a WAV file.
function writeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);          // fmt chunk size
  head.writeUInt16LE(1, 20);           // PCM
  head.writeUInt16LE(1, 22);           // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);    // bytes per second
  head.writeUInt16LE(2, 32);           // bytes per sample frame
  head.writeUInt16LE(16, 34);          // bits
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// File name -> bytes. Only what this tool owns: other files in assets/sounds are left alone.
function buildSounds() {
  return {
    'step.wav': writeWav(step()),
    'gallop.wav': writeWav(gallop()),
    'sword.wav': writeWav(sword()),
    'arrow.wav': writeWav(arrow()),
    'magic.wav': writeWav(magic()),
    'gold.wav': writeWav(gold()),
    'horn.wav': writeWav(horn()),
    'click.wav': writeWav(click()),
  };
}

export { buildSounds, OUT_DIR, RATE };

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const sounds = buildSounds(), check = process.argv.includes('--check');
  let differs = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, bytes] of Object.entries(sounds)) {
    const file = path.join(OUT_DIR, name);
    if (check) {
      const same = fs.existsSync(file) && fs.readFileSync(file).equals(bytes);
      console.log(name + (same ? ' is up to date' : ' differs from the generator'));
      differs = differs || !same;
    } else {
      fs.writeFileSync(file, bytes);
      console.log(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${bytes.length} bytes, ${((bytes.length - 44) / 2 / RATE).toFixed(2)} s`);
    }
  }
  if (check) process.exit(differs ? 1 : 0);
}
