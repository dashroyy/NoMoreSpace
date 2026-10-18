// Star Charters: sound, made on the fly with the Web Audio API (no files to download). Space-age noises: a wooden
// clack when a tile lands, a rocket whoosh for a probe, a theremin warble when wormholes open, bells for a score,
// and a swinging 1960s lounge tune (vibraphone, walking bass, brushes) for music.
let ctx = null;
let master = null;
let sfxBus = null;
let musicGain = null;
let music = null;

// volumes 0..100 and a mute switch; settings.js owns them (and remembers them) and passes them in here
const vol = { master: 80, music: 45, effects: 80, muted: false };
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

// one note: a waveform sliding from one pitch to another, with an optional wobble (vibrato) or tremolo
function tone({ type = 'sine', from, to = from, dur = 0.2, vol = 0.2, at = 0, attack = 0.005, wobble = 0, rate = 12, trem = 0, dest = sfxBus, start = null }) {
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
  let out = g;
  if (trem) {
    // a vibraphone's motor: the volume wobbles
    const tg = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = trem;
    depth.gain.value = 0.35;
    tg.gain.value = 0.65;
    lfo.connect(depth).connect(tg.gain);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    g.connect(tg);
    out = tg;
  }
  o.connect(g);
  out.connect(dest);
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

const notes = (list, { type = 'triangle', gap = 0.09, dur = 0.22, vol = 0.12, at = 0, trem = 0 } = {}) => list.forEach((f, i) => tone({ type, from: f, dur, vol, at: at + i * gap, trem }));
// a bell: a few sine partials, fading at different speeds
const bell = (f, at = 0, v = 0.12) => {
  tone({ type: 'sine', from: f, dur: 1.1, vol: v, at });
  tone({ type: 'sine', from: f * 2.76, dur: 0.5, vol: v * 0.35, at });
  tone({ type: 'sine', from: f * 5.4, dur: 0.25, vol: v * 0.15, at });
};

const SOUNDS = {
  click: () => tone({ type: 'triangle', from: 900, to: 700, dur: 0.05, vol: 0.1 }),
  hover: () => tone({ type: 'sine', from: 1500, to: 1700, dur: 0.035, vol: 0.035 }),
  select: () => tone({ type: 'sine', from: 520, to: 1040, dur: 0.09, vol: 0.13 }),
  back: () => tone({ type: 'sine', from: 800, to: 340, dur: 0.12, vol: 0.12 }),
  open: () => {
    tone({ type: 'sine', from: 330, to: 990, dur: 0.12, vol: 0.12, wobble: 25, rate: 18 });
    noise({ dur: 0.05, vol: 0.05, from: 5000, to: 2500, type: 'highpass' });
  },
  start: () => notes([392, 523, 659, 784, 1047], { type: 'sine', gap: 0.07, dur: 0.35, vol: 0.11, trem: 6 }),
  error: () => {
    tone({ type: 'square', from: 220, to: 140, dur: 0.18, vol: 0.06 });
    tone({ type: 'triangle', from: 160, to: 110, dur: 0.2, vol: 0.12 });
  },
  tick: () => tone({ type: 'square', from: 1500, dur: 0.03, vol: 0.04 }),
  // the game
  rotate: () => {
    tone({ type: 'square', from: 700, to: 1050, dur: 0.05, vol: 0.05 });
    noise({ dur: 0.06, vol: 0.06, from: 3000, to: 1200, type: 'bandpass', q: 3 });
  },
  pick: () => tone({ type: 'sine', from: 880, to: 1320, dur: 0.08, vol: 0.1 }),
  place: () => {
    noise({ dur: 0.09, vol: 0.22, from: 1800, to: 200 });
    tone({ type: 'sine', from: 170, to: 80, dur: 0.16, vol: 0.25 });
    tone({ type: 'triangle', from: 1200, to: 900, dur: 0.03, vol: 0.06 });
  },
  probe: () => {
    noise({ dur: 0.55, vol: 0.13, from: 300, to: 3500, type: 'bandpass', q: 1.5 });
    tone({ type: 'sawtooth', from: 120, to: 420, dur: 0.45, vol: 0.04 });
  },
  land: () => {
    noise({ dur: 0.12, vol: 0.12, from: 900, to: 150 });
    tone({ type: 'sine', from: 240, to: 120, dur: 0.12, vol: 0.12 });
  },
  recall: () => {
    noise({ dur: 0.5, vol: 0.12, from: 3500, to: 300, type: 'bandpass', q: 1.5 });
    tone({ type: 'sine', from: 900, to: 300, dur: 0.4, vol: 0.06 });
  },
  score: () => {
    bell(1047);
    bell(1319, 0.12);
  },
  seal: () => {
    notes([523, 659, 784, 1047], { type: 'triangle', gap: 0.08, dur: 0.3, vol: 0.1 });
    bell(1568, 0.34, 0.14);
    bell(2093, 0.46, 0.08);
  },
  lane: () => {
    tone({ type: 'square', from: 300, to: 1600, dur: 0.28, vol: 0.04 });
    tone({ type: 'sine', from: 600, to: 2400, dur: 0.28, vol: 0.08 });
    bell(1760, 0.26, 0.09);
  },
  array: () => {
    [0, 0.12, 0.24, 0.36].forEach((at, i) => tone({ type: 'sine', from: 660 * Math.pow(1.26, i), dur: 0.1, vol: 0.09, at }));
    tone({ type: 'sine', from: 1760, to: 2637, dur: 0.9, vol: 0.06, at: 0.5, wobble: 30, rate: 7 });
  },
  link: () => {
    tone({ type: 'sine', from: 300, to: 900, dur: 0.8, vol: 0.13, wobble: 30, rate: 6 });
    tone({ type: 'sine', from: 900, to: 450, dur: 0.9, vol: 0.12, wobble: 40, rate: 5, at: 0.75 });
    noise({ dur: 1.2, vol: 0.04, from: 200, to: 4000, type: 'bandpass', q: 4 });
  },
  anomaly: () => notes([1319, 1568, 1976, 2637, 3136], { type: 'triangle', gap: 0.05, dur: 0.3, vol: 0.07 }),
  boost: () => {
    tone({ type: 'sawtooth', from: 200, to: 1600, dur: 0.6, vol: 0.05 });
    tone({ type: 'sine', from: 400, to: 3200, dur: 0.6, vol: 0.08 });
  },
  skip: () => {
    tone({ type: 'sawtooth', from: 330, to: 290, dur: 0.3, vol: 0.04, wobble: 8, rate: 7 });
    tone({ type: 'sawtooth', from: 260, to: 190, dur: 0.5, vol: 0.04, wobble: 10, rate: 6, at: 0.3 });
  },
  count: () => tone({ type: 'square', from: 1400, dur: 0.04, vol: 0.035 }),
  turn: () => tone({ type: 'sine', from: 660, dur: 0.25, vol: 0.07, trem: 6 }),
  yourturn: () => notes([659, 784, 1175], { type: 'sine', gap: 0.11, dur: 0.6, vol: 0.12, trem: 6 }),
  last: () => {
    tone({ type: 'square', from: 523, dur: 0.18, vol: 0.05 });
    tone({ type: 'square', from: 415, to: 392, dur: 0.35, vol: 0.05, at: 0.2 });
  },
  win: () => {
    notes([523, 659, 784, 1047], { type: 'square', gap: 0.13, dur: 0.25, vol: 0.045 });
    notes([523, 659, 784, 1047], { type: 'triangle', gap: 0.13, dur: 0.3, vol: 0.12 });
    [523, 659, 784, 988, 1175].forEach((f) => tone({ type: 'sine', from: f, dur: 1.6, vol: 0.06, at: 0.6, trem: 6 }));
  },
};

export function sfx(name) {
  if (!soundEnabled() || !ctx || ctx.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {}
}

// ---------------------------------------------------------------------------
// music: swinging space-age lounge. ii-V jazz chords on a vibraphone, a walking bass and brushes on two and four.
// ---------------------------------------------------------------------------
const BPM = 100;
const BEAT = 60 / BPM;
const CHORDS = [
  [261.6, 329.6, 392, 493.9], // C major 7
  [220, 261.6, 329.6, 392], // A minor 7
  [293.7, 349.2, 440, 523.3], // D minor 7
  [196, 246.9, 293.7, 349.2], // G 7
];
const WALK = [
  [130.8, 164.8, 196, 207.7],
  [110, 130.8, 164.8, 138.6],
  [146.8, 174.6, 220, 185],
  [98, 123.5, 146.8, 123.5],
];
const ARP = [0, 2, 1, 3, -1, 2, 3, -1];
// a few bars of a theremin tune over the top, every other time round
const LEAD = [
  [784, 0, 659, 0, 0, 0, 587, 659],
  [523, 0, 0, 0, 440, 0, 0, 0],
  [587, 0, 698, 0, 880, 0, 784, 0],
  [698, 0, 659, 0, 587, 0, 0, 0],
];

function startMusic() {
  if (!ctx || music) return;
  music = { next: ctx.currentTime + 0.15, step: 0 };
  music.timer = setInterval(() => {
    if (!music) return;
    while (music.next < ctx.currentTime + 0.35) {
      // swing: the first eighth of each beat is long, the second short
      const long = music.step % 2 === 0;
      playStep(music.step, music.next);
      music.next += BEAT * (long ? 0.62 : 0.38);
      music.step += 1;
    }
  }, 90);
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(musicTarget(), ctx.currentTime + 2);
}

function playStep(i, t) {
  const bar = Math.floor(i / 8) % CHORDS.length;
  const round = Math.floor(i / 32);
  const eighth = i % 8;
  const chord = CHORDS[bar];
  const a = ARP[eighth];
  if (a >= 0 && (round % 4 !== 3 || eighth < 4)) tone({ type: 'sine', from: chord[a] * 2, dur: 0.7, vol: 0.05, attack: 0.004, trem: 5.5, dest: musicGain, start: t });
  // the chord itself, softly, on the first beat
  if (eighth === 0) chord.forEach((f) => tone({ type: 'sine', from: f, dur: BEAT * 3, vol: 0.018, attack: 0.02, trem: 5.5, dest: musicGain, start: t }));
  if (eighth % 2 === 0) tone({ type: 'triangle', from: WALK[bar][eighth / 2], dur: BEAT * 0.9, vol: 0.12, attack: 0.01, dest: musicGain, start: t });
  // brushes on two and four, a ride on every beat
  if (eighth === 2 || eighth === 6) noise({ dur: 0.18, vol: 0.03, from: 5000, to: 2500, type: 'bandpass', q: 0.7, dest: musicGain, start: t });
  if (eighth % 2 === 0 || eighth === 7) noise({ dur: 0.05, vol: 0.012, from: 9000, to: 7000, type: 'highpass', dest: musicGain, start: t });
  if (round % 2 === 1) {
    const f = LEAD[bar][eighth];
    if (f) tone({ type: 'sine', from: f, to: f * 0.995, dur: BEAT * 0.9, vol: 0.035, attack: 0.06, wobble: f * 0.012, rate: 5.5, dest: musicGain, start: t });
  }
}

function stopMusic() {
  if (!ctx || !music) return;
  clearInterval(music.timer);
  music = null;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
}
