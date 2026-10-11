// Phase to Space: every sound is synthesised (nothing to download), plus a calm generative score.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let soundOn = true;
let musicOn = true;
try {
  soundOn = localStorage.getItem('pts-sound') !== 'off';
  musicOn = localStorage.getItem('pts-music') !== 'off';
} catch {}

export const soundEnabled = () => soundOn;
export const musicEnabled = () => musicOn;

export function setSound(on) {
  soundOn = on;
  try {
    localStorage.setItem('pts-sound', on ? 'on' : 'off');
  } catch {}
  if (master) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05);
}

export function setMusic(on) {
  musicOn = on;
  try {
    localStorage.setItem('pts-music', on ? 'on' : 'off');
  } catch {}
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.4);
  if (on) startMusic();
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = soundOn ? 0.85 : 0;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.5 : 0;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function tone({ f = 440, type = 'sine', dur = 0.15, vol = 0.2, slide = null, delay = 0, bus = sfxBus, attack = 0.004 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, f = 1500, q = 1, type = 'bandpass', slide = null, delay = 0, bus = sfxBus }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(f, t);
  if (slide) filt.frequency.exponentialRampToValueAtTime(slide, t + dur);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(filt).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

const SOUNDS = {
  click: () => tone({ f: 880, type: 'square', dur: 0.04, vol: 0.05 }),
  hover: () => tone({ f: 1320, type: 'sine', dur: 0.03, vol: 0.02 }),
  deal: () => {
    noise({ dur: 0.12, vol: 0.12, f: 2600, slide: 600, q: 0.8 });
    tone({ f: 300, type: 'triangle', dur: 0.05, vol: 0.05, delay: 0.09 });
  },
  draw: () => {
    noise({ dur: 0.1, vol: 0.1, f: 3200, slide: 900, q: 0.8 });
  },
  play: () => {
    noise({ dur: 0.22, vol: 0.14, f: 900, slide: 3200, q: 0.7 });
    tone({ f: 150, slide: 70, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.1 });
  },
  dice: () => {
    for (let i = 0; i < 9; i++) {
      noise({ dur: 0.05, vol: 0.12, f: 1200 + Math.random() * 2200, q: 3, delay: i * 0.075 + Math.random() * 0.03 });
      tone({ f: 200 + Math.random() * 120, type: 'square', dur: 0.03, vol: 0.04, delay: i * 0.075 });
    }
    tone({ f: 420, type: 'triangle', dur: 0.1, vol: 0.12, delay: 0.78 });
  },
  tick: () => tone({ f: 1000, type: 'square', dur: 0.03, vol: 0.04 }),
  success: () => [0, 4, 7, 12].forEach((s, i) => tone({ f: hz(72 + s), type: 'triangle', dur: 0.28, vol: 0.14, delay: i * 0.07 })),
  fail: () => {
    tone({ f: 220, slide: 90, type: 'sawtooth', dur: 0.45, vol: 0.13 });
    tone({ f: 165, slide: 70, type: 'square', dur: 0.45, vol: 0.06, delay: 0.05 });
  },
  boostUp: () => {
    tone({ f: 400, slide: 1600, type: 'sawtooth', dur: 0.22, vol: 0.09 });
    tone({ f: 1600, type: 'sine', dur: 0.2, vol: 0.06, delay: 0.2 });
  },
  boostDown: () => {
    tone({ f: 1400, slide: 200, type: 'sawtooth', dur: 0.26, vol: 0.09 });
    noise({ dur: 0.2, vol: 0.08, f: 800, delay: 0.1 });
  },
  jam: () => {
    noise({ dur: 0.5, vol: 0.2, f: 3500, type: 'highpass', q: 0.5 });
    tone({ f: 1800, type: 'square', dur: 0.08, vol: 0.08 });
    tone({ f: 1200, type: 'square', dur: 0.08, vol: 0.08, delay: 0.1 });
    tone({ f: 1800, type: 'square', dur: 0.1, vol: 0.08, delay: 0.2 });
  },
  destroy: () => {
    noise({ dur: 0.55, vol: 0.28, f: 1400, slide: 80, q: 0.6 });
    tone({ f: 120, slide: 35, type: 'sine', dur: 0.5, vol: 0.34 });
  },
  steal: () => [0, 3, 7, 3].forEach((s, i) => tone({ f: hz(64 + s), type: 'triangle', dur: 0.1, vol: 0.1, delay: i * 0.07 })),
  shield: () => [0, 7, 12, 19].forEach((s, i) => tone({ f: hz(76 + s), type: 'sine', dur: 0.4, vol: 0.07, delay: i * 0.05 })),
  energy: () => {
    tone({ f: 988, type: 'square', dur: 0.06, vol: 0.06 });
    tone({ f: 1319, type: 'square', dur: 0.12, vol: 0.06, delay: 0.06 });
  },
  turn: () => {
    tone({ f: hz(76), type: 'triangle', dur: 0.2, vol: 0.12 });
    tone({ f: hz(83), type: 'triangle', dur: 0.35, vol: 0.12, delay: 0.14 });
  },
  slay: () => {
    [0, 4, 7].forEach((s) => tone({ f: hz(55 + s), type: 'sawtooth', dur: 0.8, vol: 0.09 }));
    noise({ dur: 0.4, vol: 0.2, f: 600, slide: 3000 });
    [12, 16, 19, 24].forEach((s, i) => tone({ f: hz(67 + s), type: 'triangle', dur: 0.5, vol: 0.1, delay: 0.25 + i * 0.09 }));
  },
  fight: () => {
    tone({ f: 90, slide: 45, type: 'sawtooth', dur: 0.6, vol: 0.2 });
    noise({ dur: 0.4, vol: 0.14, f: 300, slide: 100 });
  },
  win: () => {
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => tone({ f: hz(64 + s), type: 'triangle', dur: 0.4, vol: 0.12, delay: i * 0.1 }));
    [0, 7, 12].forEach((s) => tone({ f: hz(52 + s), type: 'sawtooth', dur: 1.4, vol: 0.06, delay: 0.7 }));
  },
  lose: () => [7, 3, 0, -5].forEach((s, i) => tone({ f: hz(60 + s), type: 'triangle', dur: 0.35, vol: 0.1, delay: i * 0.16 })),
  emote: () => tone({ f: 600, slide: 1000, type: 'sine', dur: 0.1, vol: 0.08 }),
  error: () => tone({ f: 160, type: 'square', dur: 0.12, vol: 0.08 }),
  join: () => [0, 7].forEach((s, i) => tone({ f: hz(72 + s), type: 'triangle', dur: 0.15, vol: 0.09, delay: i * 0.08 })),
};

export function sfx(name) {
  if (!ctx || !soundOn) return;
  try {
    SOUNDS[name]?.();
  } catch (err) {
    console.warn('[sound]', name, err);
  }
}

// ---------------------------------------------------------------------------
// Music: a slow drifting pad over a pentatonic scale, with bells and a soft pulse
// ---------------------------------------------------------------------------
let musicTimer = null;
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic
const CHORDS = [
  [0, 7, 14, 16],
  [-3, 4, 11, 14],
  [-5, 2, 9, 12],
  [-7, 0, 7, 11],
];
let step = 0;

function startMusic() {
  if (!ctx || musicTimer) return;
  const bar = () => {
    if (!ctx || !musicOn || !soundOn) return;
    const root = 50;
    const chord = CHORDS[step % CHORDS.length];
    const t = ctx.currentTime;
    // pad
    for (const n of chord) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = hz(root + n);
        o.detune.value = detune;
        f.type = 'lowpass';
        f.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.018, t + 1.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 4.4);
        o.connect(f).connect(g).connect(musicBus);
        o.start(t);
        o.stop(t + 4.6);
      }
    }
    // a deep pulse
    for (let i = 0; i < 4; i++) tone({ f: hz(root - 12 + chord[0]), type: 'sine', dur: 0.5, vol: 0.05, delay: i * 1.0, bus: musicBus, attack: 0.02 });
    // sparkles
    for (let i = 0; i < 6; i++) {
      if (Math.random() < 0.65) {
        const n = SCALE[Math.floor(Math.random() * SCALE.length)] + 12 * (1 + Math.floor(Math.random() * 2));
        tone({ f: hz(root + 12 + n), type: 'sine', dur: 1.2, vol: 0.025, delay: i * 0.66 + Math.random() * 0.3, bus: musicBus, attack: 0.01 });
      }
    }
    step += 1;
  };
  bar();
  musicTimer = setInterval(bar, 4000);
}
