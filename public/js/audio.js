// Every sound in the game is synthesised with the Web Audio API: no files to download.

let ctx = null;
let master = null;
let sfxBus = null;
let ambientBus = null;
let ambient = null;
let enabled = true;
let noiseBuffer = null;

try {
  enabled = localStorage.getItem('nms-sound') !== 'off';
} catch {}

export function soundEnabled() {
  return enabled;
}

export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem('nms-sound', on ? 'on' : 'off');
  } catch {}
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.1);
}

// Browsers only allow audio after a click/keypress.
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.6;
  sfxBus.connect(master);
  ambientBus = ctx.createGain();
  ambientBus.gain.value = 0.35;
  ambientBus.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function audioContext() {
  return ctx;
}

function tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slide = null, delay = 0, bus = sfxBus, filter = null }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq || 1000;
    osc.connect(f);
    node = f;
  }
  node.connect(gain).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', slide = null, delay = 0, bus = sfxBus }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
  f.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(gain).connect(bus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

const SOUNDS = {
  click: () => tone({ freq: 900, type: 'square', dur: 0.04, vol: 0.06 }),
  blip: () => tone({ freq: 1200, dur: 0.08, vol: 0.12, slide: 1600 }),
  chat: () => tone({ freq: 760, dur: 0.07, vol: 0.08, type: 'triangle' }),
  chime: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.5, vol: 0.15, delay: i * 0.08, type: 'triangle' })),
  task: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.14, delay: i * 0.07, type: 'triangle' })),
  buzz: () => tone({ freq: 140, type: 'sawtooth', dur: 0.25, vol: 0.12, filter: { freq: 600 } }),
  whoosh: () => noise({ dur: 0.7, vol: 0.25, freq: 300, slide: 3000, q: 0.7 }),
  airlock: () => {
    tone({ freq: 90, type: 'square', dur: 0.15, vol: 0.2, filter: { freq: 400 } });
    noise({ dur: 2.2, vol: 0.45, freq: 2500, slide: 120, q: 0.5, delay: 0.2 });
    tone({ freq: 60, type: 'sine', dur: 1.2, vol: 0.3, slide: 30, delay: 0.2 });
  },
  death: () => {
    [220, 233, 311].forEach((f) => tone({ freq: f, type: 'sawtooth', dur: 1.6, vol: 0.09, filter: { freq: 900 }, attack: 0.02 }));
    tone({ freq: 110, dur: 2, vol: 0.25, slide: 55 });
  },
  dawn: () => [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, dur: 1.2, vol: 0.1, delay: i * 0.18, type: 'sine' })),
  night: () => [587, 466, 392, 311].forEach((f, i) => tone({ freq: f, dur: 1.4, vol: 0.1, delay: i * 0.22, type: 'sine' })),
  alarm: () => [0, 0.35, 0.7].forEach((d) => tone({ freq: 880, slide: 440, type: 'square', dur: 0.3, vol: 0.12, delay: d, filter: { freq: 2000 } })),
  vote: () => tone({ freq: 1500, type: 'square', dur: 0.03, vol: 0.08 }),
  lock: () => tone({ freq: 520, type: 'triangle', dur: 0.12, vol: 0.12 }),
  hand: () => tone({ freq: 660, dur: 0.1, vol: 0.12, slide: 990 }),
  gavel: () => {
    tone({ freq: 120, type: 'square', dur: 0.12, vol: 0.25, filter: { freq: 500 } });
    noise({ dur: 0.15, vol: 0.2, freq: 800 });
  },
  shot: () => {
    tone({ freq: 1800, slide: 80, type: 'sawtooth', dur: 0.4, vol: 0.2, filter: { freq: 3000 } });
    noise({ dur: 0.5, vol: 0.3, freq: 600, slide: 100 });
  },
  zap: () => {
    for (let i = 0; i < 6; i++) tone({ freq: 200 + Math.random() * 2000, type: 'square', dur: 0.05, vol: 0.08, delay: i * 0.04 });
  },
  pop: () => tone({ freq: 400, slide: 1200, dur: 0.1, vol: 0.18 }),
  fanfare: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 6 ? 1.4 : 0.25, vol: 0.16, delay: i * 0.16 })),
  doom: () => {
    [55, 58, 82].forEach((f) => tone({ freq: f, type: 'sawtooth', dur: 4, vol: 0.14, filter: { freq: 300 }, attack: 0.5 }));
    noise({ dur: 4, vol: 0.2, freq: 200, slide: 60, q: 2, delay: 0.3 });
  },
  reveal: () => {
    noise({ dur: 0.6, vol: 0.2, freq: 4000, slide: 400, q: 1 });
    tone({ freq: 300, slide: 900, dur: 0.35, vol: 0.12, type: 'triangle' });
  },
  creak: () => {
    tone({ freq: 70 + Math.random() * 40, slide: 50, type: 'sawtooth', dur: 1.5, vol: 0.05, filter: { freq: 300 }, attack: 0.3, bus: ambientBus });
  },
  whisper: () => noise({ dur: 2.5, vol: 0.06, freq: 2500 + Math.random() * 2000, q: 8, bus: ambientBus }),
  step: () => noise({ dur: 0.06, vol: 0.05, freq: 300, q: 2 }),
};

export function sfx(name) {
  if (!ctx || !enabled) return;
  try {
    SOUNDS[name]?.();
  } catch {}
}

// A low, uneasy drone that changes with the phase.
export function setAmbient(mood) {
  if (!ctx) return;
  if (ambient?.mood === mood) return;
  if (ambient) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
    setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 4000);
    clearInterval(old.timer);
  }
  const settings = {
    calm: { freqs: [55, 82.4], cutoff: 260, vol: 0.5, heartbeat: false },
    day: { freqs: [49, 73.4, 98.7], cutoff: 340, vol: 0.55, heartbeat: false },
    night: { freqs: [41.2, 43.6, 61.7], cutoff: 200, vol: 0.75, heartbeat: false },
    tense: { freqs: [46.2, 49, 69.3], cutoff: 420, vol: 0.6, heartbeat: true },
    silent: { freqs: [], cutoff: 100, vol: 0, heartbeat: false },
  }[mood] || { freqs: [55], cutoff: 300, vol: 0.4 };
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(settings.vol, ctx.currentTime, 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = settings.cutoff;
  filter.connect(gain).connect(ambientBus);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = settings.cutoff * 0.5;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  const nodes = [lfo];
  for (const f of settings.freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = (Math.random() - 0.5) * 14;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    osc.connect(g).connect(filter);
    osc.start();
    nodes.push(osc);
  }
  // Occasional creaks, whispers and (when tense) a heartbeat.
  const timer = setInterval(() => {
    if (!enabled) return;
    if (settings.heartbeat) {
      tone({ freq: 55, dur: 0.18, vol: 0.35, bus: ambientBus });
      tone({ freq: 50, dur: 0.2, vol: 0.25, delay: 0.22, bus: ambientBus });
    } else if (mood !== 'silent' && Math.random() < 0.18) {
      SOUNDS[mood === 'night' && Math.random() < 0.6 ? 'whisper' : 'creak']();
    }
  }, settings.heartbeat ? 900 : 2500);
  ambient = { mood, gain, nodes, timer };
}
