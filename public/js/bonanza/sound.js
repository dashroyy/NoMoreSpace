// Star Bonanza: sound, made on the fly with the Web Audio API (no files to download). Soft thumps for planting,
// a cascade of chimes for a harvest, a swap for a trade, and a slow cosmic drone for music.
let ctx = null;
let master = null;
let sfxBus = null;
let musicGain = null;
let musicNodes = null;

// volumes 0..100 and a mute switch; settings.js owns them (and remembers them) and passes them in here
const vol = { master: 80, music: 50, effects: 80, muted: false };
const MUSIC_LEVEL = 0.35;
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
    if (musicNodes) musicGain.gain.setTargetAtTime(musicTarget(), t, 0.3);
  } else stopMusic();
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
  o.connect(g).connect(sfxBus);
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
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t0);
}

const SOUNDS = {
  click: () => tone({ type: 'triangle', from: 900, to: 700, dur: 0.06, vol: 0.12 }),
  // the menus: a soft tick when the highlight moves, a bright blip to confirm, a lower one to go back
  hover: () => tone({ type: 'triangle', from: 2100, to: 1900, dur: 0.035, vol: 0.035 }),
  select: () => {
    tone({ type: 'square', from: 1046, to: 1046, dur: 0.05, vol: 0.05 });
    tone({ type: 'triangle', from: 1568, to: 1760, dur: 0.12, vol: 0.08, at: 0.045 });
  },
  back: () => tone({ type: 'triangle', from: 740, to: 440, dur: 0.12, vol: 0.08 }),
  open: () => noise({ dur: 0.28, vol: 0.09, from: 600, to: 4200, q: 3 }),
  start: () => {
    noise({ dur: 1.6, vol: 0.22, from: 180, to: 5200, q: 5 });
    [0, 0.12, 0.24, 0.36].forEach((at, i) => tone({ type: 'triangle', from: [262, 392, 523, 784][i], dur: 1.6, vol: 0.09, at, attack: 0.04 }));
    tone({ type: 'sine', from: 65, to: 130, dur: 1.8, vol: 0.18, attack: 0.2 });
  },
  error: () => tone({ type: 'square', from: 196, to: 160, dur: 0.18, vol: 0.06 }),
  // a star goes into a nursery: a soft thump and a rising chime
  plant: () => {
    tone({ type: 'sine', from: 190, to: 80, dur: 0.2, vol: 0.28 });
    tone({ type: 'triangle', from: 660, to: 1046, dur: 0.28, vol: 0.08, at: 0.05, attack: 0.02 });
    noise({ dur: 0.12, vol: 0.06, from: 3000, to: 600 });
  },
  // a harvest: stars collapse into lumens, a little cascade of chimes
  harvest: () => {
    noise({ dur: 0.3, vol: 0.12, from: 5000, to: 400, q: 2 });
    [0, 0.07, 0.14, 0.21].forEach((at, i) => tone({ type: 'triangle', from: [1175, 1319, 1568, 1760][i], dur: 0.4, vol: 0.09, at: at + 0.08 }));
  },
  bigharvest: () => {
    noise({ dur: 0.5, vol: 0.18, from: 6000, to: 300, q: 2 });
    tone({ type: 'sine', from: 90, to: 40, dur: 0.5, vol: 0.3 });
    [0, 0.07, 0.14, 0.21, 0.28, 0.35, 0.42].forEach((at, i) => tone({ type: 'triangle', from: [784, 988, 1175, 1319, 1568, 1760, 2093][i], dur: 0.5, vol: 0.1, at: at + 0.1 }));
  },
  lumen: () => tone({ type: 'sine', from: 1568, to: 2093, dur: 0.12, vol: 0.07 }),
  // stars are turned over, and the deck
  flip: () => {
    noise({ dur: 0.1, vol: 0.12, from: 4500, to: 900, q: 2 });
    tone({ type: 'triangle', from: 880, to: 1320, dur: 0.12, vol: 0.06, at: 0.04 });
  },
  reveal: () => {
    noise({ dur: 0.35, vol: 0.14, from: 500, to: 3500, q: 3 });
    [0.1, 0.2].forEach((at, i) => tone({ type: 'triangle', from: [988, 1319][i], dur: 0.35, vol: 0.09, at }));
  },
  draw: () => noise({ dur: 0.18, vol: 0.1, from: 3200, to: 700, q: 2 }),
  reshuffle: () => {
    noise({ dur: 1.1, vol: 0.2, from: 300, to: 3000, q: 4 });
    tone({ type: 'sawtooth', from: 70, to: 260, dur: 1.0, vol: 0.07 });
  },
  last: () => [0, 0.22, 0.44].forEach((at) => tone({ type: 'square', from: 880, to: 660, dur: 0.18, vol: 0.07, at })),
  // trading: an offer pings, a deal swaps
  offer: () => [0, 0.09].forEach((at, i) => tone({ type: 'sine', from: [740, 988][i], dur: 0.2, vol: 0.1, at })),
  trade: () => {
    tone({ type: 'triangle', from: 523, to: 784, dur: 0.18, vol: 0.1 });
    tone({ type: 'triangle', from: 784, to: 523, dur: 0.18, vol: 0.1, at: 0.14 });
    tone({ type: 'triangle', from: 1046, dur: 0.3, vol: 0.09, at: 0.3 });
  },
  gift: () => [0, 0.08, 0.16].forEach((at, i) => tone({ type: 'sine', from: [659, 784, 1046][i], dur: 0.3, vol: 0.09, at })),
  field: () => [0, 0.06].forEach((at, i) => tone({ type: 'square', from: [1200, 1600][i], dur: 0.1, vol: 0.06, at })),
  // whose turn it is
  turn: () => [0, 0.1].forEach((at, i) => tone({ type: 'sine', from: [660, 880][i], dur: 0.25, vol: 0.12, at })),
  yourturn: () => [0, 0.1, 0.2].forEach((at, i) => tone({ type: 'triangle', from: [523, 659, 988][i], dur: 0.35, vol: 0.13, at })),
  tick: () => tone({ type: 'square', from: 1500, dur: 0.04, vol: 0.05 }),
  win: () => [0, 0.15, 0.3, 0.45, 0.7].forEach((at, i) => tone({ type: 'triangle', from: [523, 659, 784, 1047, 1319][i], dur: 0.7, vol: 0.13, at })),
};

export function sfx(name) {
  if (!soundEnabled() || !ctx || ctx.state !== 'running') return;
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
  musicGain.gain.linearRampToValueAtTime(musicTarget(), ctx.currentTime + 3);
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
