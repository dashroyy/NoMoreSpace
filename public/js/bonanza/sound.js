// Star Bonanza: sound, made on the fly with the Web Audio API (no files to download). Cartoon noises: boings and
// plops for planting, a ka-ching for a harvest, a slide whistle when the UFO zooms off, a wah-wah when a patch fizzles
// out, and a bouncy little marimba tune for music.
let ctx = null;
let master = null;
let sfxBus = null;
let musicGain = null;
let music = null;

// volumes 0..100 and a mute switch; settings.js owns them (and remembers them) and passes them in here
const vol = { master: 80, music: 50, effects: 80, muted: false };
const MUSIC_LEVEL = 0.5;
const musicTarget = () => (vol.muted ? 0 : (vol.music / 100) * MUSIC_LEVEL);
export const soundEnabled = () => !vol.muted && vol.effects > 0;
export const musicEnabled = () => !vol.muted && vol.music > 0;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (musicEnabled()) startMusic();
}

export function setVolumes(v) {
  Object.assign(vol, v);
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime((vol.master / 100) * 0.7, t, 0.05);
  sfxBus.gain.setTargetAtTime(vol.muted ? 0 : vol.effects / 100, t, 0.05);
  if (musicEnabled()) {
    startMusic();
    musicGain.gain.setTargetAtTime(musicTarget(), t, 0.3);
  } else stopMusic();
}

// one note: a waveform sliding from one pitch to another, with an optional wobble (vibrato)
function tone({ type = 'sine', from, to = from, dur = 0.2, vol = 0.2, at = 0, attack = 0.005, wobble = 0, rate = 12, dest = sfxBus, start = null }) {
  const t0 = start ?? ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  if (wobble) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = rate;
    depth.gain.value = wobble;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, at = 0, from = 2000, to = 400, q = 1, type = 'lowpass', dest = sfxBus, start = null }) {
  const t0 = start ?? ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0);
}

const notes = (list, { type = 'triangle', gap = 0.09, dur = 0.22, vol = 0.12, at = 0 } = {}) => list.forEach((f, i) => tone({ type, from: f, dur, vol, at: at + i * gap }));
const coin = (at = 0) => {
  tone({ type: 'square', from: 1976, dur: 0.07, vol: 0.05, at });
  tone({ type: 'triangle', from: 2637, dur: 0.3, vol: 0.09, at: at + 0.06 });
};

const SOUNDS = {
  click: () => tone({ type: 'triangle', from: 900, to: 700, dur: 0.05, vol: 0.1 }),
  hover: () => tone({ type: 'sine', from: 1300, to: 1500, dur: 0.04, vol: 0.04 }),
  select: () => tone({ type: 'sine', from: 420, to: 950, dur: 0.1, vol: 0.14 }),
  back: () => tone({ type: 'sine', from: 760, to: 300, dur: 0.12, vol: 0.12 }),
  open: () => {
    tone({ type: 'sine', from: 300, to: 1100, dur: 0.08, vol: 0.13 });
    noise({ dur: 0.05, vol: 0.06, from: 4000, to: 2000 });
  },
  start: () => notes([523, 659, 784, 1047], { gap: 0.08, vol: 0.13 }),
  error: () => {
    tone({ type: 'square', from: 220, to: 130, dur: 0.18, vol: 0.06 });
    tone({ type: 'triangle', from: 160, to: 110, dur: 0.2, vol: 0.12 });
  },
  tick: () => tone({ type: 'square', from: 1500, dur: 0.03, vol: 0.04 }),
  // the game
  plant: () => {
    tone({ type: 'sine', from: 180, to: 560, dur: 0.28, vol: 0.18, wobble: 40, rate: 22 });
    noise({ dur: 0.12, vol: 0.12, from: 700, to: 150, at: 0.02 });
  },
  harvest: () => {
    noise({ dur: 0.05, vol: 0.12, from: 6000, to: 3000, type: 'highpass' });
    tone({ type: 'square', from: 1319, dur: 0.06, vol: 0.05, at: 0.04 });
    tone({ type: 'square', from: 1760, dur: 0.06, vol: 0.05, at: 0.1 });
    tone({ type: 'sine', from: 2637, dur: 0.5, vol: 0.12, at: 0.14 });
  },
  bigharvest: () => {
    SOUNDS.harvest();
    notes([1047, 1319, 1568, 2093], { gap: 0.07, at: 0.25, vol: 0.1 });
  },
  coin: () => coin(),
  lumen: () => coin(),
  fizzle: () => {
    tone({ type: 'sawtooth', from: 330, to: 300, dur: 0.3, vol: 0.05, wobble: 8, rate: 7 });
    tone({ type: 'sawtooth', from: 260, to: 180, dur: 0.6, vol: 0.05, wobble: 10, rate: 6, at: 0.3 });
  },
  // a fart, in one of a few varieties: long and rumbling, short and sharp, or a quick double
  fart: () => {
    const kind = Math.floor(Math.random() * 3);
    const base = 85 + Math.random() * 70;
    const burst = (at, dur, pitch) => {
      tone({ type: 'sawtooth', from: pitch * 1.7, to: pitch * 0.7, dur, vol: 0.2, at, wobble: 40 + Math.random() * 50, rate: 22 + Math.random() * 18 });
      tone({ type: 'square', from: pitch * 0.85, to: pitch * 0.5, dur: dur * 0.9, vol: 0.09, at: at + 0.02, wobble: 30, rate: 19 });
      noise({ dur, vol: 0.11, from: 900, to: 150, q: 2, at });
    };
    if (kind === 0) burst(0, 0.6, base);
    else if (kind === 1) burst(0, 0.28, base * 1.3);
    else {
      burst(0, 0.18, base * 1.2);
      burst(0.22, 0.34, base);
    }
  },
  ufo: () => {
    tone({ type: 'sine', from: 500, to: 1000, dur: 0.45, vol: 0.12, wobble: 60, rate: 9 });
    tone({ type: 'sine', from: 1000, to: 600, dur: 0.4, vol: 0.1, wobble: 60, rate: 9, at: 0.4 });
  },
  offer: () => notes([880, 660], { type: 'sine', gap: 0.13, dur: 0.3, vol: 0.1 }),
  trade: () => {
    noise({ dur: 0.28, vol: 0.12, from: 400, to: 3500, type: 'bandpass', q: 2 });
    tone({ type: 'sine', from: 300, to: 900, dur: 0.1, vol: 0.12, at: 0.25 });
  },
  gift: () => notes([523, 659, 784], { type: 'sine', gap: 0.1, dur: 0.4, vol: 0.11 }),
  drop: () => notes([1047, 784], { type: 'triangle', gap: 0.1, dur: 0.15, vol: 0.1 }),
  draw: () => [0, 0.08, 0.16].forEach((at) => noise({ dur: 0.06, vol: 0.1, from: 5000, to: 1500, at, type: 'bandpass', q: 3 })),
  sold: () => {
    tone({ type: 'square', from: 180, dur: 0.06, vol: 0.08 });
    notes([523, 784], { type: 'sawtooth', gap: 0.14, dur: 0.35, vol: 0.06, at: 0.1 });
    notes([659, 988], { type: 'triangle', gap: 0.14, dur: 0.35, vol: 0.08, at: 0.1 });
  },
  refill: () => {
    tone({ type: 'sine', from: 400, to: 1600, dur: 0.5, vol: 0.12 });
    tone({ type: 'sine', from: 1600, to: 400, dur: 0.6, vol: 0.12, at: 0.9 });
  },
  last: () => {
    tone({ type: 'square', from: 523, dur: 0.18, vol: 0.06 });
    tone({ type: 'square', from: 415, to: 392, dur: 0.35, vol: 0.06, at: 0.2 });
  },
  turn: () => tone({ type: 'triangle', from: 660, dur: 0.15, vol: 0.08 }),
  yourturn: () => notes([523, 659, 988], { gap: 0.1, dur: 0.3, vol: 0.13 }),
  win: () => {
    notes([523, 659, 784, 1047], { type: 'square', gap: 0.13, dur: 0.25, vol: 0.05 });
    notes([523, 659, 784, 1047], { type: 'triangle', gap: 0.13, dur: 0.3, vol: 0.12 });
    [523, 659, 784, 1047].forEach((f) => tone({ type: 'triangle', from: f, dur: 1.2, vol: 0.08, at: 0.6 }));
  },
};

export function sfx(name) {
  if (!soundEnabled() || !ctx || ctx.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {}
}

// ---------------------------------------------------------------------------
// music: a bouncy little marimba tune over a plucky bass, scheduled a moment ahead
// ---------------------------------------------------------------------------
const BPM = 112;
const STEP = 60 / BPM / 2; // eighth notes
const BASS = [130.8, 110, 87.3, 98]; // C, A minor, F, G
const TUNE = [
  [659, 0, 784, 0, 880, 784, 659, 0],
  [523, 0, 659, 0, 587, 523, 440, 0],
  [440, 0, 523, 0, 587, 523, 440, 392],
  [392, 0, 494, 0, 587, 0, 0, 0],
  [659, 0, 784, 0, 880, 0, 1047, 0],
  [880, 784, 659, 0, 587, 0, 523, 0],
  [440, 0, 523, 587, 659, 0, 587, 523],
  [784, 0, 659, 0, 523, 0, 0, 0],
];

function startMusic() {
  if (!ctx || music) return;
  music = { next: ctx.currentTime + 0.15, step: 0 };
  music.timer = setInterval(() => {
    if (!music) return;
    while (music.next < ctx.currentTime + 0.3) {
      playStep(music.step, music.next);
      music.next += STEP;
      music.step += 1;
    }
  }, 90);
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(musicTarget(), ctx.currentTime + 2);
}

function playStep(i, t) {
  const bar = Math.floor(i / 8) % TUNE.length;
  const beat = i % 8;
  const f = TUNE[bar][beat];
  if (f) {
    tone({ type: 'triangle', from: f, dur: 0.28, vol: 0.07, attack: 0.004, dest: musicGain, start: t });
    tone({ type: 'sine', from: f * 2, dur: 0.12, vol: 0.025, attack: 0.002, dest: musicGain, start: t });
  }
  if (beat % 2 === 0) tone({ type: 'triangle', from: BASS[bar % 4] / (beat % 4 ? 1 : 2), dur: 0.3, vol: 0.12, dest: musicGain, start: t });
  if (beat % 2 === 1) noise({ dur: 0.03, vol: 0.025, from: 9000, to: 6000, type: 'highpass', dest: musicGain, start: t });
}

function stopMusic() {
  if (!ctx || !music) return;
  clearInterval(music.timer);
  music = null;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
}
