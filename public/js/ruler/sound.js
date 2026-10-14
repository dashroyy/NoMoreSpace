// Ruler of the Galaxy: sound, made on the fly with the Web Audio API (no files to download). Laser zaps,
// explosions, dice clatter, chimes for Stars, a warp whoosh, and a slow cosmic drone for music.
let ctx = null;
let master = null;
let musicGain = null;
let musicNodes = null;

const KEY_SOUND = 'rotg-sound';
const KEY_MUSIC = 'rotg-music';
const read = (k, def) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? def : v === '1';
  } catch {
    return def;
  }
};
const write = (k, on) => {
  try {
    localStorage.setItem(k, on ? '1' : '0');
  } catch {}
};
let soundOn = read(KEY_SOUND, true);
let musicOn = read(KEY_MUSIC, true);
export const soundEnabled = () => soundOn;
export const musicEnabled = () => musicOn;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (musicOn) startMusic();
}

export function setSound(on) {
  soundOn = on;
  write(KEY_SOUND, on);
}
export function setMusic(on) {
  musicOn = on;
  write(KEY_MUSIC, on);
  if (on) startMusic();
  else stopMusic();
}

function tone({ type = 'sine', from, to = from, dur = 0.2, vol = 0.2, at = 0, attack = 0.005 }) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.4, vol = 0.3, at = 0, from = 2000, to = 200, q = 0.8 }) {
  const t0 = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const SOUNDS = {
  click: () => tone({ type: 'triangle', from: 900, to: 700, dur: 0.06, vol: 0.12 }),
  keep: () => tone({ type: 'sine', from: 660, to: 990, dur: 0.1, vol: 0.14 }),
  dice: () => {
    for (let i = 0; i < 7; i++) noise({ dur: 0.05, vol: 0.18, at: i * 0.07 + Math.random() * 0.03, from: 5000, to: 1500, q: 2 });
    tone({ type: 'square', from: 220, to: 110, dur: 0.12, vol: 0.05, at: 0.45 });
  },
  laser: () => {
    tone({ type: 'sawtooth', from: 1800, to: 120, dur: 0.22, vol: 0.12 });
    tone({ type: 'square', from: 900, to: 60, dur: 0.18, vol: 0.06, at: 0.02 });
  },
  hit: () => noise({ dur: 0.25, vol: 0.3, from: 1800, to: 120 }),
  boom: () => {
    noise({ dur: 1.4, vol: 0.55, from: 1200, to: 40, q: 0.6 });
    tone({ type: 'sine', from: 90, to: 28, dur: 1.2, vol: 0.4 });
  },
  star: () => [0, 0.08, 0.16].forEach((at, i) => tone({ type: 'triangle', from: [988, 1319, 1760][i], dur: 0.3, vol: 0.1, at })),
  shard: () => [0, 0.06, 0.12].forEach((at, i) => tone({ type: 'sine', from: [523, 659, 784][i] * 1.5, dur: 0.22, vol: 0.08, at })),
  heal: () => tone({ type: 'sine', from: 330, to: 660, dur: 0.5, vol: 0.1, attack: 0.08 }),
  warp: () => {
    noise({ dur: 0.9, vol: 0.25, from: 300, to: 4000, q: 4 });
    tone({ type: 'sawtooth', from: 80, to: 600, dur: 0.8, vol: 0.06 });
  },
  enter: () => [0, 0.12, 0.24, 0.36].forEach((at, i) => tone({ type: 'triangle', from: [523, 659, 784, 1047][i], dur: 0.5, vol: 0.12, at })),
  alarm: () => [0, 0.22].forEach((at) => tone({ type: 'square', from: 880, to: 660, dur: 0.18, vol: 0.08, at })),
  turn: () => [0, 0.1].forEach((at, i) => tone({ type: 'sine', from: [660, 880][i], dur: 0.25, vol: 0.12, at })),
  evolve: () => [0, 0.1, 0.2, 0.3, 0.4].forEach((at, i) => tone({ type: 'sine', from: [392, 494, 587, 740, 988][i], dur: 0.6, vol: 0.09, at })),
  anomaly: () => {
    tone({ type: 'sawtooth', from: 110, to: 55, dur: 1.6, vol: 0.12, attack: 0.3 });
    noise({ dur: 1.6, vol: 0.2, from: 200, to: 2500, q: 6 });
  },
  buy: () => [0, 0.07].forEach((at, i) => tone({ type: 'square', from: [1200, 1600][i], dur: 0.1, vol: 0.06, at })),
  block: () => tone({ type: 'sine', from: 1400, to: 900, dur: 0.3, vol: 0.12 }),
  ghost: () => tone({ type: 'sine', from: 440, to: 220, dur: 1.2, vol: 0.08, attack: 0.3 }),
  win: () => [0, 0.15, 0.3, 0.45, 0.7].forEach((at, i) => tone({ type: 'triangle', from: [523, 659, 784, 1047, 1319][i], dur: 0.7, vol: 0.13, at })),
};

export function sfx(name) {
  if (!soundOn || !ctx || ctx.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {}
}

// music: a slow drone of detuned oscillators through a moving filter
function startMusic() {
  if (!ctx || musicNodes) return;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  filter.Q.value = 3;
  filter.connect(musicGain);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 380;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  const oscs = [55, 82.4, 110, 164.8, 55.4].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i % 2 ? 0.05 : 0.09;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });
  musicNodes = { oscs, lfo, filter };
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 3);
}

function stopMusic() {
  if (!ctx || !musicNodes) return;
  const nodes = musicNodes;
  musicNodes = null;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  setTimeout(() => {
    for (const o of nodes.oscs) o.stop();
    nodes.lfo.stop();
  }, 1200);
}
