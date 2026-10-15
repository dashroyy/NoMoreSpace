// Every sound in the game is synthesised with the Web Audio API: no files to download.
//
// The music is an original, generative score: a haunted music-box waltz with
// a theremin singing over it, choir pads, pizzicato and ticking clocks. Think
// a gothic lullaby drifting through space. Each mood has its own arrangement
// and the melodies are composed on the fly, so no two games sound the same.
//
// Each script has its own score and its own sound effects: Black Hole Blues keeps the haunted
// music-box waltz, the Cosmic Carnival is a wheezing, slightly out-of-tune fairground calliope and
// a drum roll, the Outbreak is clinical (heart monitors, sonar pings, pulsing synths, klaxons) and
// the Citadel of Traitors is gothic (organ, lute and harpsichord, low strings, timpani, tolling bells).

let ctx = null;
let master = null;
let sfxBus = null;
let ambientBus = null;
let musicBus = null;
let reverb = null;
let reverbSend = null;
let ambient = null;
let enabled = true;
let musicOn = true;
let noiseBuffer = null;

try {
  enabled = localStorage.getItem('nms-sound') !== 'off';
  musicOn = localStorage.getItem('nms-music') !== 'off';
} catch {}

const MUSIC_LEVEL = 0.65;
const SFX_LEVEL = 0.6;
const AMBIENT_LEVEL = 0.35;

// Volume sliders (0..1), remembered in this browser.
const volumes = { music: 1, sfx: 1 };
for (const k of Object.keys(volumes)) {
  try {
    const v = parseFloat(localStorage.getItem(`nms-vol-${k}`));
    if (Number.isFinite(v)) volumes[k] = Math.max(0, Math.min(1, v));
  } catch {}
}

export function getVolume(kind) {
  return volumes[kind] ?? 1;
}

export function setVolume(kind, value) {
  if (!(kind in volumes)) return;
  volumes[kind] = Math.max(0, Math.min(1, Number(value) || 0));
  try {
    localStorage.setItem(`nms-vol-${kind}`, String(volumes[kind]));
  } catch {}
  if (!ctx) return;
  if (kind === 'music') musicBus.gain.setTargetAtTime(musicOn ? MUSIC_LEVEL * volumes.music : 0, ctx.currentTime, 0.1);
  else {
    sfxBus.gain.setTargetAtTime(SFX_LEVEL * volumes.sfx, ctx.currentTime, 0.1);
    ambientBus.gain.setTargetAtTime(AMBIENT_LEVEL * volumes.sfx, ctx.currentTime, 0.1);
  }
}

// Someone listening for sound effects (the sound captions), even when sound is off.
let sfxListener = null;
export function onSfx(fn) {
  sfxListener = fn;
}

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

export function musicEnabled() {
  return musicOn;
}

export function setMusic(on) {
  musicOn = on;
  try {
    localStorage.setItem('nms-music', on ? 'on' : 'off');
  } catch {}
  if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL * volumes.music : 0, ctx.currentTime, 0.4);
}

// A big, dark hall: a few seconds of decaying noise used as a reverb.
function makeReverb(seconds = 3.4, decay = 2.6) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  const node = ctx.createConvolver();
  node.buffer = buffer;
  return node;
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

  reverb = makeReverb();
  reverb.connect(master);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.4;
  reverbSend.connect(reverb);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_LEVEL * volumes.sfx;
  sfxBus.connect(master);
  const sfxVerb = ctx.createGain();
  sfxVerb.gain.value = 0.18;
  sfxBus.connect(sfxVerb).connect(reverb);

  ambientBus = ctx.createGain();
  ambientBus.gain.value = AMBIENT_LEVEL * volumes.sfx;
  ambientBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? MUSIC_LEVEL * volumes.music : 0;
  musicBus.connect(master);
  musicBus.connect(reverbSend);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function audioContext() {
  return ctx;
}

// What the room soundscape (world/soundscape.js) plays through: the ambient
// bus (so the effects volume and the sound switch apply), and the shared noise.
export function ambienceKit() {
  if (!ctx || !ambientBus) return null;
  return { ctx, bus: ambientBus, noise: noiseBuffer, enabled: () => enabled };
}

// ---------------------------------------------------------------------------
// Basic building blocks
// ---------------------------------------------------------------------------

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slide = null, delay = 0, bus = sfxBus, filter = null, at = null }) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime + delay;
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

function noise({ dur = 0.3, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', slide = null, delay = 0, bus = sfxBus, at = null }) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime + delay;
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

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

// Music box / celesta: FM synthesis with a slightly inharmonic ratio gives the
// glassy, tinkly attack. A low ratio (1.4) turns it into a gong or ship's bell.
function bell(midi, t, { vol = 0.1, decay = 1.8, ratio = 3.5, index = 2, bus = sfxBus } = {}) {
  const f = hz(midi);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(f * index, t);
  depth.gain.exponentialRampToValueAtTime(f * 0.02 + 0.01, t + decay * 0.6);
  mod.connect(depth).connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  car.connect(g).connect(bus);
  car.start(t);
  mod.start(t);
  car.stop(t + decay + 0.05);
  mod.stop(t + decay + 0.05);
}

// Pizzicato strings / plucked bass: a bright triangle whose filter snaps shut.
function pluck(midi, t, { vol = 0.16, decay = 0.45, bright = 2600, bus } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = hz(midi);
  const body = ctx.createOscillator();
  body.type = 'sawtooth';
  body.frequency.value = hz(midi);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.25;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(bright, t);
  f.frequency.exponentialRampToValueAtTime(180, t + decay * 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(f);
  body.connect(bodyGain).connect(f);
  f.connect(g).connect(bus);
  for (const o of [osc, body]) {
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

// A soft, round bass note.
function bass(midi, t, { vol = 0.2, dur = 1, bus } = {}) {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// A ghostly choir: detuned saws through two "ah" vowel formants.
function choir(midis, t, dur, { vol = 0.09, bus, vowel = [700, 1150] } = {}) {
  const attack = Math.min(1.4, dur / 3);
  const release = Math.min(1.8, dur / 3);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + attack);
  out.gain.setValueAtTime(vol, t + dur - release);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(bus);
  const mix = ctx.createGain();
  mix.gain.value = 1 / midis.length;
  for (const [freq, q, level] of [[vowel[0], 4, 1], [vowel[1], 6, 0.7]]) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const lvl = ctx.createGain();
    lvl.gain.value = level * 2.2;
    mix.connect(f).connect(lvl).connect(out);
  }
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 900;
  const warmLvl = ctx.createGain();
  warmLvl.gain.value = 0.35;
  mix.connect(warm).connect(warmLvl).connect(out);
  for (const m of midis) {
    for (const cents of [-9, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = cents;
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

// The theremin: one continuous voice that glides from note to note with a
// wide, wobbly vibrato. notes: [{ midi, t, dur }] in time order.
function theremin(notes, { vol = 0.07, bus } = {}) {
  if (!notes.length) return;
  const start = notes[0].t;
  const end = notes.at(-1).t + notes.at(-1).dur;
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  b.type = 'triangle';
  const bGain = ctx.createGain();
  bGain.gain.value = 0.22;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.4;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(4, start);
  vibDepth.gain.linearRampToValueAtTime(22, start + 1.2);
  vib.connect(vibDepth);
  vibDepth.connect(a.detune);
  vibDepth.connect(b.detune);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  a.frequency.setValueAtTime(hz(notes[0].midi), start);
  b.frequency.setValueAtTime(hz(notes[0].midi), start);
  for (const n of notes) {
    a.frequency.setTargetAtTime(hz(n.midi), n.t, 0.05); // portamento: the theremin's signature swoop
    b.frequency.setTargetAtTime(hz(n.midi), n.t, 0.05);
    g.gain.setTargetAtTime(vol, n.t, 0.07);
    g.gain.setTargetAtTime(vol * 0.55, n.t + n.dur * 0.75, 0.1);
  }
  g.gain.setTargetAtTime(0.0001, end, 0.3);
  a.connect(f);
  b.connect(bGain).connect(f);
  f.connect(g).connect(bus);
  for (const o of [a, b, vib]) {
    o.start(start);
    o.stop(end + 2);
  }
}

// A wooden clock tick ("tick" and a lower "tock").
function tick(t, { tock = false, vol = 0.07, bus } = {}) {
  tone({ freq: tock ? 900 : 1300, dur: 0.06, vol, bus, at: t });
  noise({ dur: 0.03, vol: vol * 0.6, freq: tock ? 2000 : 3200, q: 6, bus, at: t });
}

function heartbeat(t, { vol = 0.3, bus } = {}) {
  tone({ freq: 55, dur: 0.18, vol, bus, at: t });
  tone({ freq: 50, dur: 0.2, vol: vol * 0.7, bus, at: t + 0.22 });
}

// ----- the Carnival's instruments -----

// A steam calliope / fairground organ: bright, reedy pipes with a touch of tremolo, never quite in tune.
function calliope(midi, t, { vol = 0.07, dur = 0.3, bus = sfxBus, wobble = 0 } = {}) {
  const f = hz(midi);
  const a = ctx.createOscillator();
  a.type = 'square';
  a.frequency.value = f;
  a.detune.value = (Math.random() - 0.5) * 2 * wobble;
  const b = ctx.createOscillator();
  b.type = 'sawtooth';
  b.frequency.value = f * 2;
  b.detune.value = 7 + (Math.random() - 0.5) * wobble;
  const bGain = ctx.createGain();
  bGain.gain.value = 0.3;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  lp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  a.connect(lp);
  b.connect(bGain).connect(lp);
  lp.connect(g).connect(bus);
  for (const o of [a, b]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// The oom of the oom-pah: a short, round tuba note.
function tuba(midi, t, { vol = 0.18, dur = 0.28, bus = sfxBus } = {}) {
  tone({ freq: hz(midi), type: 'sawtooth', dur, vol, attack: 0.012, filter: { freq: 520 }, bus, at: t });
}

function snare(t, { vol = 0.08, bus = sfxBus } = {}) {
  noise({ dur: 0.11, vol, freq: 1900, q: 0.9, bus, at: t });
  tone({ freq: 190, dur: 0.07, vol: vol * 0.6, type: 'triangle', bus, at: t });
}

function kick(t, { vol = 0.3, bus = sfxBus } = {}) {
  tone({ freq: 120, slide: 42, dur: 0.24, vol, bus, at: t });
}

function cymbal(t, { vol = 0.07, dur = 1.1, bus = sfxBus } = {}) {
  noise({ dur, vol, freq: 7000, q: 0.4, type: 'highpass', bus, at: t });
}

// ----- the Citadel's instruments -----

// A church organ: the first four harmonics of each note, with a breath of wind on the way in.
function organ(midis, t, dur, { vol = 0.07, bus = sfxBus, detune = 0 } = {}) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.5, dur / 3));
  out.gain.setValueAtTime(vol, t + Math.max(0.05, dur - 0.7));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.connect(out);
  out.connect(bus);
  for (const m of midis) {
    [[1, 1], [2, 0.5], [3, 0.26], [4, 0.14]].forEach(([k, level]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(m) * k;
      o.detune.value = (Math.random() - 0.5) * 2 * detune;
      const lv = ctx.createGain();
      lv.gain.value = level / midis.length;
      o.connect(lv).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }
}

// A bowed string section: three detuned saws per note, a slow swell and a little vibrato.
function strings(midis, t, dur, { vol = 0.07, bus = sfxBus, bright = 1800 } = {}) {
  const attack = Math.min(1.1, dur / 3);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + attack);
  out.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.6));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = bright;
  lp.connect(out);
  out.connect(bus);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 9;
  vib.connect(vibDepth);
  vib.start(t);
  vib.stop(t + dur + 0.05);
  const mix = ctx.createGain();
  mix.gain.value = 0.9 / (midis.length * 3);
  mix.connect(lp);
  for (const m of midis) {
    for (const cents of [-8, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = cents;
      vibDepth.connect(o.detune);
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

// A harpsichord: a bright, quick pluck with a ghost of the octave above.
function harpsichord(midi, t, { vol = 0.1, bus = sfxBus } = {}) {
  pluck(midi, t, { vol, decay: 0.34, bright: 5200, bus });
  pluck(midi + 12, t, { vol: vol * 0.4, decay: 0.2, bright: 6000, bus });
}

// A timpani: a skin that thumps and drops a little in pitch.
function timpani(midi, t, { vol = 0.3, bus = sfxBus } = {}) {
  tone({ freq: hz(midi) * 1.25, slide: hz(midi), dur: 1.0, vol, attack: 0.008, bus, at: t });
  noise({ dur: 0.12, vol: vol * 0.55, freq: 220, q: 0.8, type: 'lowpass', bus, at: t });
}

// ----- the Outbreak's instruments -----

// A heart-monitor beep.
function beep(t, { freq = 1000, dur = 0.1, vol = 0.05, bus = sfxBus } = {}) {
  tone({ freq, dur, vol, attack: 0.004, bus, at: t });
}

// A sonar ping: a pure tone that rings out and fades.
function sonar(midi, t, { vol = 0.045, decay = 2.4, bus = sfxBus } = {}) {
  tone({ freq: hz(midi), dur: decay, vol, attack: 0.006, bus, at: t });
  tone({ freq: hz(midi) * 2.01, dur: decay * 0.5, vol: vol * 0.25, attack: 0.006, bus, at: t });
}

// A clipped, filtered square-wave synth note, for the pulsing arpeggios.
function pulse(midi, t, { vol = 0.06, dur = 0.14, bright = 1500, bus = sfxBus } = {}) {
  tone({ freq: hz(midi), type: 'square', dur, vol, attack: 0.004, filter: { freq: bright }, bus, at: t });
}

// A single geiger-counter click.
function geiger(t, { vol = 0.04, bus = sfxBus } = {}) {
  noise({ dur: 0.02, vol, freq: 3600, q: 0.8, type: 'highpass', bus, at: t });
}

// An alarm siren: one slow swoop up and down.
function klaxon(t, dur, { vol = 0.04, bus = sfxBus } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(420, t);
  o.frequency.linearRampToValueAtTime(640, t + dur / 2);
  o.frequency.linearRampToValueAtTime(420, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
  g.gain.setValueAtTime(vol, t + dur - 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------

// Chords (MIDI notes) in D minor, with the gothic C# of the harmonic minor on A.
const CH = {
  Dm: [50, 53, 57], Dm9: [50, 53, 57, 64], Gm: [43, 46, 50], Gm6: [43, 46, 50, 52], Bb: [46, 50, 53], Bbmaj7: [46, 50, 53, 57],
  C: [48, 52, 55], F: [41, 45, 48], A: [45, 49, 52], A7: [45, 49, 52, 55], Asus: [45, 50, 52], Eb: [39, 43, 46], Cdim: [49, 52, 55],
  Bbm: [46, 49, 53], D: [50, 54, 57], G: [43, 47, 50], Bm: [47, 50, 54], Em: [52, 55, 59],
  Am: [45, 48, 52], E: [40, 44, 47], D7: [50, 54, 57, 60], Cm: [48, 51, 55], Db: [49, 53, 56], Fm: [41, 44, 48], Ab: [44, 48, 51], Bdim: [47, 50, 53],
};
const MINOR = [2, 4, 5, 7, 9, 10, 0]; // D natural minor (pitch classes)
const MAJOR = [2, 4, 6, 7, 9, 11, 1]; // D major
const MAJOR_C = [0, 2, 4, 5, 7, 9, 11]; // C major (the Carnival)
const MINOR_A = [9, 11, 0, 2, 4, 5, 7]; // A natural minor
const C_MINOR = [0, 2, 3, 5, 7, 8, 10]; // C minor (the Outbreak)
const DORIAN = [2, 4, 5, 7, 9, 11, 0]; // D dorian: a minor key with a medieval, hopeful ache (the Citadel)

// Pitch classes for melodies over a chord: borrow the chord's own notes (so A gets its C#).
function scaleFor(chord, base) {
  const pcs = new Set(base);
  for (const m of chord) {
    const pc = m % 12;
    if (!pcs.has(pc)) {
      pcs.delete((pc + 11) % 12); // e.g. C# replaces C
      pcs.add(pc);
    }
  }
  return pcs;
}

function notesIn(pcs, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

function nearest(list, target) {
  return list.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best), list[0]);
}

const rnd = (list) => list[Math.floor(Math.random() * list.length)];

// Compose a melody phrase: chord tones on the downbeats, stepwise wandering
// in between, an arch-shaped contour and a long note to finish.
function composePhrase(bars, { base, lo, hi, start, meter, beat, holdChance = 0.35 }) {
  const notes = [];
  let prev = start;
  const climbBars = Math.ceil(bars.length / 2);
  bars.forEach(({ chord, t }, b) => {
    const pcs = scaleFor(chord, base);
    const scale = notesIn(pcs, lo, hi);
    const chordTones = scale.filter((m) => chord.some((c) => c % 12 === m % 12));
    const last = b === bars.length - 1;
    for (let k = 0; k < meter; k++) {
      const time = t + k * beat;
      if (last && k > 0) break; // the final note rings for the whole bar
      let midi;
      if (k === 0) {
        const lean = b < climbBars ? 2 : -2; // up, then back down
        midi = nearest(chordTones, prev + lean + (Math.random() < 0.3 ? rnd([-3, 3]) : 0));
      } else if (Math.random() < holdChance) {
        continue; // hold the previous note longer
      } else {
        const i = scale.indexOf(nearest(scale, prev));
        const dir = b < climbBars ? (Math.random() < 0.7 ? 1 : -1) : Math.random() < 0.7 ? -1 : 1;
        const step = Math.random() < 0.8 ? 1 : 2;
        midi = scale[Math.max(0, Math.min(scale.length - 1, i + dir * step))];
      }
      notes.push({ midi, t: time, dur: beat });
      prev = midi;
    }
  });
  // stretch each note until the next one starts
  for (let i = 0; i < notes.length; i++) {
    const next = notes[i + 1];
    const barEnd = bars.at(-1).t + meter * beat;
    notes[i].dur = (next ? next.t : barEnd) - notes[i].t;
  }
  return notes;
}

// ---------------------------------------------------------------------------
// The arrangements
// ---------------------------------------------------------------------------

// Each mood: tempo, beats per bar, chord loop, how long each chord lasts, and
// what to play on each eighth-note step (s = step within the bar).
const MOODS = {
  // Lobby: a slow music-box waltz with the theremin answering every other phrase.
  calm: {
    bpm: 78, meter: 3, chords: ['Dm', 'Bb', 'Gm6', 'A', 'Dm', 'Bbmaj7', 'Gm', 'A7'], verb: 0.45,
    step({ s, t, chord, bus }) {
      const arp = [0, 1, 2, 3, 2, 1];
      const tones = [...chord.slice(0, 3), chord[0] + 12];
      bell(tones[arp[s]] + 24, t, { vol: 0.055, decay: 1.6, bus });
      if (s === 0) {
        bass(chord[0] - 12, t, { vol: 0.16, dur: 1.8, bus });
        choir(chord.map((m) => m + 12), t, this.barDur + 0.4, { vol: 0.035, bus });
      }
    },
    melody: { every: 2, instrument: 'theremin', lo: 62, hi: 81, base: MINOR, vol: 0.06 },
  },
  // Day: a sly oom-pah-pah waltz (pizzicato bass, celesta chords), theremin or celesta tunes on top.
  day: {
    bpm: 104, meter: 3, chords: ['Dm', 'Gm', 'C', 'F', 'Bb', 'Gm', 'A7', 'Dm'], verb: 0.3,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) pluck(chord[0] - 12, t, { vol: 0.2, bus });
      if (s === 2 || s === 4) chord.slice(0, 3).forEach((m) => bell(m + 12, t, { vol: 0.03, decay: 0.45, ratio: 4, index: 1.2, bus }));
      if (s === 5 && bar % 2 === 1) pluck(chord[2] - 12, t, { vol: 0.12, decay: 0.3, bus });
    },
    melody: { every: 1, chance: 0.6, instrument: 'alternate', lo: 62, hi: 84, base: MINOR, vol: 0.055 },
  },
  // Night: no beat at all. Choir chords, a music box playing to itself, a theremin far away.
  night: {
    bpm: 52, meter: 4, chords: ['Dm9', 'Bbmaj7', 'Gm6', 'Asus', 'Dm9', 'Bbmaj7', 'Gm', 'A'], barsPerChord: 2, verb: 0.75,
    step({ s, t, chord, bar, bus }) {
      if (s === 0 && bar % 2 === 0) choir(chord, t, this.barDur * 2 + 1.5, { vol: 0.07, bus, vowel: [500, 900] });
      if (s % 2 === 0 && Math.random() < 0.28) {
        const scale = notesIn(scaleFor(chord, MINOR), 74, 93);
        bell(rnd(scale), t, { vol: 0.04, decay: 3.2, bus });
      }
    },
    melody: { every: 4, chance: 0.5, bars: 2, instrument: 'theremin', lo: 57, hi: 76, base: MINOR, vol: 0.045, holdChance: 0.6 },
  },
  // Nominations & dusk: a ticking clock, a creeping pizzicato ostinato, and a heartbeat.
  tense: {
    bpm: 76, meter: 4, chords: ['Dm', 'Eb', 'Dm', 'Cdim'], verb: 0.35,
    step({ s, t, chord, bus }) {
      const ost = [0, 12, 7, 12, 0, 12, 8, 7];
      pluck(chord[0] - 12 + ost[s], t, { vol: 0.11, decay: 0.28, bright: 1800, bus });
      if (s % 2 === 0) tick(t, { tock: s % 4 === 2, vol: 0.045, bus });
      if (s === 0) {
        heartbeat(t, { vol: 0.28, bus });
        choir(chord.map((m) => m - 12), t, this.barDur + 0.3, { vol: 0.045, bus, vowel: [450, 800] });
      }
    },
    melody: null,
  },
  // The crew escapes: the waltz again, in D major, bright and twinkly.
  victory: {
    bpm: 96, meter: 3, chords: ['D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D'], verb: 0.4,
    step({ s, t, chord, bus }) {
      const arp = [0, 1, 2, 3, 2, 1];
      const tones = [...chord.slice(0, 3), chord[0] + 12];
      bell(tones[arp[s]] + 24, t, { vol: 0.06, decay: 1.4, bus });
      if (s === 0) {
        pluck(chord[0] - 12, t, { vol: 0.18, bus });
        choir(chord.map((m) => m + 12), t, this.barDur + 0.3, { vol: 0.04, bus, vowel: [800, 1300] });
      }
    },
    melody: { every: 1, instrument: 'bell', lo: 66, hi: 86, base: MAJOR, vol: 0.07 },
  },
  // No more space: low choir, a tolling bell and a theremin sinking into the dark.
  doom: {
    bpm: 46, meter: 4, chords: ['Dm', 'Eb', 'Bbm', 'A'], barsPerChord: 1, verb: 0.8,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        choir(chord.map((m) => m - 12), t, this.barDur + 1, { vol: 0.08, bus, vowel: [400, 750] });
        bell(chord[0] - 12, t, { vol: 0.12, decay: 5, ratio: 1.4, index: 3, bus });
      }
    },
    melody: { every: 2, instrument: 'theremin', lo: 50, hi: 69, base: MINOR, vol: 0.05, holdChance: 0.55 },
  },
};


// ---------------------------------------------------------------------------
// The other scripts' scores. Same moods, different music: Black Hole Blues (above) is the haunted
// music-box waltz; each of these replaces it with an arrangement that suits its universe.
// ---------------------------------------------------------------------------
const CARNIVAL_MOODS = {
  // Lobby: a carousel waltz on a calliope that has seen better days.
  calm: {
    bpm: 92, meter: 3, chords: ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C'], verb: 0.3,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) tuba(chord[0] - 12, t, { vol: 0.15, dur: 0.4, bus });
      if (s === 2 || s === 4) chord.slice(0, 3).forEach((m) => calliope(m + 12, t, { vol: 0.026, dur: 0.24, bus, wobble: 14 }));
      if (s === 5 && bar % 2 === 1) bell(chord[2] + 36, t, { vol: 0.03, decay: 0.7, bus });
    },
    melody: { every: 1, chance: 0.8, instrument: 'calliope', lo: 67, hi: 88, base: MAJOR_C, vol: 0.05 },
  },
  // Day: a galloping oom-pah polka: tuba, chord stabs, a snare on the off-beat.
  day: {
    bpm: 128, meter: 2, chords: ['C', 'C', 'F', 'C', 'G', 'C', 'F', 'G'], verb: 0.25,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) tuba(chord[0] - 12, t, { vol: 0.17, bus });
      if (s === 2) tuba(chord[0] - 5, t, { vol: 0.14, bus });
      if (s === 1 || s === 3) {
        chord.slice(0, 3).forEach((m) => calliope(m + 12, t, { vol: 0.024, dur: 0.16, bus, wobble: 10 }));
        snare(t, { vol: 0.04, bus });
      }
      if (s === 0 && bar % 4 === 0) cymbal(t, { vol: 0.03, dur: 0.6, bus });
    },
    melody: { every: 1, chance: 0.85, bars: 2, instrument: 'calliope', lo: 69, hi: 91, base: MAJOR_C, vol: 0.05, holdChance: 0.2 },
  },
  // Night: the lullaby has gone wrong: slow, detuned, a music box playing to an empty tent.
  night: {
    bpm: 58, meter: 3, chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'G', 'E'], verb: 0.75,
    step({ s, t, chord, bus }) {
      if (s === 0) organ(chord, t, this.barDur + 0.5, { vol: 0.045, bus, detune: 22 });
      if (s % 2 === 0 && Math.random() < 0.4) bell(rnd(notesIn(scaleFor(chord, MINOR_A), 76, 96)), t, { vol: 0.04, decay: 2.8, bus });
    },
    melody: { every: 3, chance: 0.6, instrument: 'bell', lo: 72, hi: 93, base: MINOR_A, vol: 0.045, holdChance: 0.5 },
  },
  // Nominations & dusk: the drum roll before the big trick.
  tense: {
    bpm: 108, meter: 4, chords: ['Am', 'E', 'Am', 'Dm', 'Am', 'E', 'F', 'E'], verb: 0.3,
    step({ s, t, chord, bar, bus }) {
      snare(t, { vol: 0.02 + (s / 8) * 0.025, bus });
      if (s % 4 === 0) tuba(chord[0] - 12, t, { vol: 0.13, dur: 0.22, bus });
      if (s === 0) heartbeat(t, { vol: 0.2, bus });
      if (s === 2 || s === 6) calliope(chord[1] + 12, t, { vol: 0.03, dur: 0.12, bus, wobble: 18 });
      if (s === 6 && bar % 4 === 3) cymbal(t, { vol: 0.05, dur: 1.4, bus });
    },
    melody: null,
  },
  // The crew escapes: the big finish, fanfare and cymbals.
  victory: {
    bpm: 120, meter: 4, chords: ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C'], verb: 0.3,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) {
        tuba(chord[0] - 12, t, { vol: 0.18, bus });
        kick(t, { vol: 0.2, bus });
        if (bar % 4 === 0) cymbal(t, { vol: 0.05, dur: 1.2, bus });
      }
      if (s === 4) tuba(chord[0] - 5, t, { vol: 0.15, bus });
      if (s % 2 === 0) bell(chord[(s / 2) % 3] + 36, t, { vol: 0.045, decay: 0.8, bus });
      if (s === 2 || s === 6) chord.slice(0, 3).forEach((m) => calliope(m + 12, t, { vol: 0.03, dur: 0.2, bus, wobble: 8 }));
    },
    melody: { every: 1, instrument: 'calliope', lo: 69, hi: 91, base: MAJOR_C, vol: 0.06 },
  },
  // No more show: the calliope dragging itself through the dark, with a heartbeat for a drum.
  doom: {
    bpm: 40, meter: 4, chords: ['Am', 'E', 'Dm', 'E'], barsPerChord: 1, verb: 0.8,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        organ(chord.map((m) => m - 12), t, this.barDur + 1, { vol: 0.06, bus, detune: 30 });
        bell(chord[0] - 12, t, { vol: 0.1, decay: 5, ratio: 1.4, index: 3, bus });
        heartbeat(t, { vol: 0.24, bus });
      }
      if (s === 4) heartbeat(t, { vol: 0.18, bus });
    },
    melody: { every: 2, instrument: 'calliope', lo: 55, hi: 76, base: MINOR_A, vol: 0.05, holdChance: 0.55 },
  },
};

const OUTBREAK_MOODS = {
  // Lobby: a quiet ward at night. A pad, a heart monitor, a ping now and then.
  calm: {
    bpm: 66, meter: 4, chords: ['Cm', 'Ab', 'Fm', 'G'], verb: 0.5,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        strings(chord.map((m) => m + 12), t, this.barDur + 0.6, { vol: 0.06, bus, bright: 1300 });
        sonar(chord[0] + 36, t, { vol: 0.05, bus });
      }
      if (s % 4 === 0) beep(t, { freq: 880, dur: 0.08, vol: 0.016, bus });
    },
    melody: { every: 2, chance: 0.5, bars: 2, instrument: 'sonar', lo: 72, hi: 91, base: C_MINOR, vol: 0.04, holdChance: 0.5 },
  },
  // Day: a pulsing synth ostinato, a sub bass, geiger clicks. Something is spreading.
  day: {
    bpm: 118, meter: 4, chords: ['Cm', 'Cm', 'Db', 'Cm', 'Bdim', 'Cm', 'Ab', 'G'], verb: 0.3,
    step({ s, t, chord, bus }) {
      const ost = [0, 7, 12, 7, 0, 7, 12, 15];
      pulse(chord[0] + ost[s % 8], t, { vol: 0.045, dur: 0.12, bright: 1200 + (s % 2) * 500, bus });
      if (s === 0) bass(chord[0] - 12, t, { vol: 0.17, dur: 0.9, bus });
      if (Math.random() < 0.3) geiger(t + Math.random() * 0.2, { vol: 0.03, bus });
    },
    melody: { every: 2, chance: 0.4, bars: 2, instrument: 'sonar', lo: 72, hi: 91, base: C_MINOR, vol: 0.04, holdChance: 0.5 },
  },
  // Night: a slow heartbeat, a low pad and a ping from far down a corridor.
  night: {
    bpm: 48, meter: 4, chords: ['Cm', 'Db', 'Cm', 'Bdim'], barsPerChord: 2, verb: 0.7,
    step({ s, t, chord, bar, bus }) {
      if (s === 0 && bar % 2 === 0) strings(chord.map((m) => m - 12), t, this.barDur * 2 + 1, { vol: 0.06, bus, bright: 900 });
      if (s === 0 || s === 4) heartbeat(t, { vol: 0.14, bus });
      if (s % 2 === 0 && Math.random() < 0.22) sonar(rnd(notesIn(scaleFor(chord, C_MINOR), 76, 96)), t, { vol: 0.03, decay: 3, bus });
    },
    melody: null,
  },
  // Nominations & dusk: the monitor speeds up. Beeps, bass pulses, a siren on every fourth bar.
  tense: {
    bpm: 144, meter: 4, chords: ['Cm', 'Db', 'Cm', 'Bdim'], verb: 0.25,
    step({ s, t, chord, bar, bus }) {
      pulse(chord[0] + (s % 2 ? 12 : 0), t, { vol: 0.05, dur: 0.1, bright: 1000, bus });
      if (s % 2 === 0) beep(t, { freq: 1250, dur: 0.07, vol: 0.03, bus });
      if (s === 0 || s === 4) kick(t, { vol: 0.2, bus });
      if (s === 0 && bar % 4 === 3) klaxon(t, this.barDur, { vol: 0.025, bus });
    },
    melody: null,
  },
  // The crew escapes: the all-clear, a clean pad and bells.
  victory: {
    bpm: 90, meter: 4, chords: ['C', 'G', 'Am', 'F'], verb: 0.4,
    step({ s, t, chord, bus }) {
      if (s === 0) strings(chord.map((m) => m + 12), t, this.barDur + 0.4, { vol: 0.05, bus, bright: 2400 });
      if (s % 2 === 0) bell(chord[(s / 2) % 3] + 36, t, { vol: 0.05, decay: 1.3, bus });
    },
    melody: { every: 1, instrument: 'bell', lo: 66, hi: 88, base: MAJOR_C, vol: 0.06 },
  },
  // Quarantine failed: a siren, a double heartbeat and a flatline.
  doom: {
    bpm: 52, meter: 4, chords: ['Cm', 'Db', 'Cm', 'Bdim'], barsPerChord: 1, verb: 0.6,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) {
        klaxon(t, this.barDur, { vol: 0.03, bus });
        organ(chord.map((m) => m - 12), t, this.barDur + 0.8, { vol: 0.05, bus });
        if (bar % 4 === 3) beep(t + 0.4, { freq: 1000, dur: 1.5, vol: 0.025, bus }); // flatline
      }
      if (s === 0 || s === 4) heartbeat(t, { vol: 0.26, bus });
    },
    melody: null,
  },
};

const TRAITORS_MOODS = {
  // Lobby: guests arriving at the castle. Organ, a lute, a bell, a lone string melody.
  calm: {
    bpm: 70, meter: 4, chords: ['Dm', 'C', 'G', 'Dm', 'Bb', 'C', 'Am', 'Dm'], verb: 0.6,
    step({ s, t, chord, bar, bus }) {
      if (s === 0) {
        organ(chord.map((m) => m + 12), t, this.barDur + 0.5, { vol: 0.038, bus });
        if (bar % 4 === 0) bell(chord[0] - 12, t, { vol: 0.09, decay: 4, ratio: 1.4, index: 3, bus });
      }
      const arp = [0, 1, 2, 1, 2, 1, 0, 1];
      pluck(chord[arp[s % 8] % chord.length] + 12, t, { vol: 0.085, decay: 0.8, bright: 2600, bus });
    },
    melody: { every: 2, chance: 0.7, instrument: 'strings', lo: 57, hi: 78, base: DORIAN, vol: 0.05, holdChance: 0.5 },
  },
  // Day: the Round Table. A harpsichord ostinato over low strings, a timpani on the bar.
  day: {
    bpm: 96, meter: 4, chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Gm', 'A', 'Dm'], verb: 0.45,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        timpani(38, t, { vol: 0.2, bus });
        strings(chord.map((m) => m - 12), t, this.barDur + 0.5, { vol: 0.045, bus, bright: 1200 });
      }
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      harpsichord(chord[arp[s % 8] % chord.length] + 12, t, { vol: 0.07, bus });
    },
    melody: { every: 1, chance: 0.55, instrument: 'strings', lo: 57, hi: 78, base: DORIAN, vol: 0.05, holdChance: 0.4 },
  },
  // Night: the Traitors' hour. A deep organ, a distant choir, a bell tolling far off.
  night: {
    bpm: 46, meter: 4, chords: ['Dm', 'Bb', 'Gm', 'A'], barsPerChord: 2, verb: 0.8,
    step({ s, t, chord, bar, bus }) {
      if (s === 0 && bar % 2 === 0) {
        organ(chord.map((m) => m - 12), t, this.barDur * 2 + 1.2, { vol: 0.07, bus });
        choir(chord, t, this.barDur * 2 + 1.2, { vol: 0.04, bus, vowel: [450, 800] });
      }
      if (s === 0 && bar % 4 === 0) bell(chord[0] - 12, t, { vol: 0.11, decay: 5.5, ratio: 1.4, index: 3, bus });
    },
    melody: { every: 4, chance: 0.5, bars: 2, instrument: 'bell', lo: 69, hi: 88, base: DORIAN, vol: 0.04, holdChance: 0.6 },
  },
  // Nominations & dusk: the vote. Timpani heartbeat, tremolo strings, a clock.
  tense: {
    bpm: 84, meter: 4, chords: ['Dm', 'Eb', 'Dm', 'Cdim'], verb: 0.45,
    step({ s, t, chord, bus }) {
      if (s === 0) timpani(38, t, { vol: 0.26, bus });
      if (s === 3) timpani(38, t, { vol: 0.18, bus });
      if (s % 2 === 0) {
        strings([chord[0] - 12 + (s % 4 === 2 ? 12 : 0)], t, 0.5, { vol: 0.035, bus, bright: 1500 });
        tick(t, { tock: s % 4 === 2, vol: 0.04, bus });
      }
      if (s === 0) choir(chord.map((m) => m - 12), t, this.barDur + 0.3, { vol: 0.04, bus, vowel: [450, 800] });
    },
    melody: null,
  },
  // The Faithful win: bells and a major chord at last.
  victory: {
    bpm: 88, meter: 4, chords: ['D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D'], verb: 0.5,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        choir(chord.map((m) => m + 12), t, this.barDur + 0.4, { vol: 0.05, bus, vowel: [800, 1300] });
        organ(chord, t, this.barDur + 0.3, { vol: 0.045, bus });
        timpani(38, t, { vol: 0.16, bus });
      }
      if (s % 2 === 0) bell(chord[(s / 2) % 3] + 36, t, { vol: 0.05, decay: 1.4, bus });
    },
    melody: { every: 1, instrument: 'bell', lo: 66, hi: 86, base: MAJOR, vol: 0.07 },
  },
  // The Traitors win: a tolling bell, a low choir and the timpani.
  doom: {
    bpm: 42, meter: 4, chords: ['Dm', 'Eb', 'Bbm', 'A'], barsPerChord: 1, verb: 0.85,
    step({ s, t, chord, bus }) {
      if (s === 0) {
        choir(chord.map((m) => m - 12), t, this.barDur + 1, { vol: 0.08, bus, vowel: [400, 750] });
        bell(chord[0] - 12, t, { vol: 0.14, decay: 6, ratio: 1.4, index: 3, bus });
        timpani(34, t, { vol: 0.26, bus });
      }
      if (s === 4) timpani(34, t, { vol: 0.16, bus });
    },
    melody: { every: 2, instrument: 'strings', lo: 45, hi: 64, base: MINOR, vol: 0.05, holdChance: 0.6 },
  },
};

// which score each script plays (a mood a script does not list falls back to Black Hole Blues')
const MOOD_SETS = { classic: MOODS, carnival: CARNIVAL_MOODS, outbreak: OUTBREAK_MOODS, traitors: TRAITORS_MOODS };
let scriptId = 'classic';

// how one composed phrase is played, by instrument
function playMelody(kind, notes, mel, bus, state) {
  const vol = mel.vol;
  if (kind === 'alternate') kind = state.phrases % 2 === 1 ? 'bell' : 'theremin';
  switch (kind) {
    case 'bell':
      for (const n of notes) bell(n.midi, n.t, { vol, decay: Math.min(2.2, n.dur + 0.8), bus });
      break;
    case 'calliope':
      for (const n of notes) calliope(n.midi, n.t, { vol, dur: Math.max(0.12, n.dur * 0.9), bus, wobble: 16 });
      break;
    case 'strings':
      for (const n of notes) strings([n.midi], n.t, n.dur + 0.2, { vol: vol * 0.9, bus, bright: 2200 });
      break;
    case 'sonar':
      for (const n of notes) sonar(n.midi, n.t, { vol, decay: Math.min(3, n.dur + 1), bus });
      break;
    case 'harpsichord':
      for (const n of notes) harpsichord(n.midi, n.t, { vol: vol * 1.6, bus });
      break;
    default:
      theremin(notes, { vol, bus });
  }
}

export function setMusicScript(id) {
  id = MOOD_SETS[id] ? id : 'classic';
  if (id === scriptId) return;
  scriptId = id;
  if (ctx && ambient) setAmbient(ambient.mood, true); // the same part of the game, in the new script's music
}

let music = null;

function stopMusic(fade = 1.5) {
  if (!music) return;
  const old = music;
  music = null;
  clearInterval(old.timer);
  old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
  setTimeout(() => old.gain.disconnect(), (fade + 6) * 1000); // let scheduled notes run out silently
}

function startMusic(name) {
  const def = (MOOD_SETS[scriptId] || MOODS)[name] || MOODS[name];
  stopMusic();
  if (!def) return;
  const beat = 60 / def.bpm;
  const mood = Object.create(def);
  mood.barDur = beat * def.meter;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  gain.connect(musicBus);
  reverbSend.gain.setTargetAtTime(def.verb, ctx.currentTime, 1);
  const state = { name, gain, step: 0, next: ctx.currentTime + 0.15, phrases: 0, lastNote: 69 };
  const stepsPerBar = def.meter * 2;
  const perChord = def.barsPerChord || 1;
  const chordAt = (bar) => CH[def.chords[Math.floor(bar / perChord) % def.chords.length]];

  const schedule = () => {
    if (!ctx || music !== state) return;
    const ahead = document.hidden ? 1.6 : 0.35; // background tabs only wake up once a second
    while (state.next < ctx.currentTime + ahead) {
      const s = state.step % stepsPerBar;
      const bar = Math.floor(state.step / stepsPerBar);
      const t = state.next;
      if (musicOn && enabled) {
        try {
          mood.step({ s, t, bar, chord: chordAt(bar), bus: gain });
          const mel = def.melody;
          const len = mel?.bars || 4;
          if (mel && s === 0 && bar % len === 0) {
            const phrase = bar / len;
            const wanted = phrase % (mel.every || 1) === (mel.every > 1 ? 1 : 0) && Math.random() < (mel.chance ?? 1);
            if (wanted) {
              const bars = Array.from({ length: len }, (_, i) => ({ chord: chordAt(bar + i), t: t + i * mood.barDur }));
              const notes = composePhrase(bars, { base: mel.base, lo: mel.lo, hi: mel.hi, start: Math.max(mel.lo, Math.min(mel.hi, state.lastNote)), meter: def.meter, beat, holdChance: mel.holdChance ?? 0.35 });
              state.lastNote = notes.at(-1)?.midi ?? state.lastNote;
              playMelody(mel.instrument, notes, mel, gain, state);
              state.phrases += 1;
            }
          }
        } catch (err) {
          console.warn(err);
        }
      }
      state.step += 1;
      state.next += beat / 2;
    }
  };
  state.timer = setInterval(schedule, 60);
  music = state;
  schedule();
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

const now = () => ctx.currentTime;

const SOUNDS = {
  // the Captain's comedy stingers
  trombone: () => [[311, 0], [294, 0.45], [277, 0.9], [262, 1.35]].forEach(([f, d], i) => tone({ freq: f, slide: i === 3 ? 220 : f * 0.98, type: 'sawtooth', dur: i === 3 ? 1.3 : 0.42, vol: 0.12, delay: d, filter: { freq: 1400 } })),
  drumroll: () => {
    for (let i = 0; i < 28; i++) noise({ dur: 0.06, vol: 0.12 + i * 0.005, freq: 220, q: 0.8, type: 'lowpass', delay: i * 0.07 });
    noise({ dur: 0.9, vol: 0.35, freq: 5000, q: 0.5, type: 'highpass', delay: 2 });
    tone({ freq: 70, type: 'sine', dur: 0.4, vol: 0.4, delay: 2 });
  },
  airhorn: () => [0, 0.32, 0.64].forEach((d, i) => [440, 554, 659].forEach((f) => tone({ freq: f, type: 'sawtooth', dur: i === 2 ? 0.8 : 0.25, vol: 0.08, delay: d, filter: { freq: 2600 } }))),
  crickets: () => {
    for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) tone({ freq: 4200, type: 'triangle', dur: 0.04, vol: 0.05, delay: k * 0.7 + i * 0.07 });
  },
  kazoo: () => [523, 587, 659, 523, 784].forEach((f, i) => tone({ freq: f, slide: f * 1.02, type: 'sawtooth', dur: 0.22, vol: 0.09, delay: i * 0.22, filter: { type: 'bandpass', freq: 1200 } })),
  gasp: () => {
    noise({ dur: 0.5, vol: 0.25, freq: 1600, q: 1.2, slide: 2600 });
    [392, 330].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.6, vol: 0.08, delay: 0.1 + i * 0.05 }));
  },

  // the title menu: a tick as the highlight moves, a bright blip to choose, a lower one to go back, a rising sweep to open a window
  hover: () => tone({ freq: 2100, slide: 1900, dur: 0.03, vol: 0.03, type: 'triangle' }),
  select: () => {
    tone({ freq: 1046, dur: 0.05, vol: 0.05, type: 'square' });
    tone({ freq: 1568, slide: 1760, dur: 0.12, vol: 0.07, type: 'triangle', delay: 0.045 });
  },
  back: () => tone({ freq: 740, slide: 440, dur: 0.12, vol: 0.07, type: 'triangle' }),
  open: () => noise({ dur: 0.28, vol: 0.08, freq: 600, slide: 4200, q: 3 }),
  error: () => tone({ freq: 196, slide: 160, dur: 0.18, vol: 0.06, type: 'square' }),
  // pressing start on the title screen: a rising sweep, a chord and a deep note
  start: () => {
    noise({ dur: 1.6, vol: 0.2, freq: 180, slide: 5200, q: 5 });
    [0, 0.12, 0.24, 0.36].forEach((d, i) => tone({ freq: [262, 392, 523, 784][i], type: 'triangle', dur: 1.6, vol: 0.08, delay: d, attack: 0.04 }));
    tone({ freq: 65, slide: 130, type: 'sine', dur: 1.8, vol: 0.16, attack: 0.2 });
  },

  // UI: soft wooden taps and little bells rather than computer bleeps
  tap: () => tone({ freq: 1500, dur: 0.035, vol: 0.035, type: 'sine' }),
  click: () => {
    tone({ freq: 1100, dur: 0.05, vol: 0.06 });
    noise({ dur: 0.025, vol: 0.03, freq: 2600, q: 5 });
  },
  blip: () => bell(88, now(), { vol: 0.07, decay: 0.6 }),
  chat: () => bell(86, now(), { vol: 0.04, decay: 0.4, index: 1 }),
  chime: () => [74, 77, 81, 86].forEach((m, i) => bell(m, now() + i * 0.09, { vol: 0.08, decay: 1.4 })),
  task: () => [74, 78, 81, 86, 90].forEach((m, i) => bell(m, now() + i * 0.07, { vol: 0.08, decay: 1.2 })),
  buzz: () => {
    // a sour little theremin "wah-wah"
    theremin([{ midi: 58, t: now(), dur: 0.18 }, { midi: 55, t: now() + 0.18, dur: 0.3 }], { vol: 0.09, bus: sfxBus });
  },
  whoosh: () => noise({ dur: 0.7, vol: 0.25, freq: 300, slide: 3000, q: 0.7 }),
  airlock: () => {
    bell(45, now(), { vol: 0.16, decay: 1.8, ratio: 1.4, index: 3 });
    noise({ dur: 2.2, vol: 0.45, freq: 2500, slide: 120, q: 0.5, delay: 0.2 });
    tone({ freq: 60, type: 'sine', dur: 1.2, vol: 0.3, slide: 30, delay: 0.2 });
  },
  death: () => {
    choir([50, 53, 56], now(), 2.2, { vol: 0.12, bus: sfxBus, vowel: [450, 800] });
    bell(38, now(), { vol: 0.18, decay: 3, ratio: 1.4, index: 3 });
  },
  // dawn: a sunrise on the celesta (D major); night: a lullaby falling asleep (D minor)
  dawn: () => [62, 66, 69, 74, 78].forEach((m, i) => bell(m + 12, now() + i * 0.14, { vol: 0.07, decay: 2 })),
  night: () => {
    [81, 77, 74, 69, 62].forEach((m, i) => bell(m, now() + i * 0.22, { vol: 0.07, decay: 2.4 }));
    bell(38, now() + 1.1, { vol: 0.1, decay: 4, ratio: 1.4, index: 2 });
  },
  // emergency meeting: the ship's bell tolls three times over an organ stab
  alarm: () => {
    [0, 0.5, 1].forEach((d) => bell(57, now() + d, { vol: 0.16, decay: 1.4, ratio: 1.41, index: 4 }));
    choir([50, 56, 59], now(), 1.6, { vol: 0.1, bus: sfxBus, vowel: [650, 1100] });
  },
  vote: () => tick(now(), { vol: 0.07, bus: sfxBus }),
  lock: () => bell(69, now(), { vol: 0.08, decay: 0.5, index: 1 }),
  knock: () => [0, 0.13, 0.5, 0.63].forEach((d) => {
    tone({ freq: 120, slide: 70, dur: 0.09, vol: 0.2, type: 'triangle', delay: d });
    noise({ dur: 0.05, vol: 0.1, freq: 700, q: 2, delay: d });
  }),
  hand: () => {
    bell(74, now(), { vol: 0.06, decay: 0.5 });
    bell(81, now() + 0.07, { vol: 0.06, decay: 0.7 });
  },
  gavel: () => {
    tone({ freq: 120, type: 'square', dur: 0.12, vol: 0.25, filter: { freq: 500 } });
    noise({ dur: 0.15, vol: 0.2, freq: 800 });
  },
  shot: () => {
    tone({ freq: 1800, slide: 80, type: 'sawtooth', dur: 0.4, vol: 0.2, filter: { freq: 3000 } });
    noise({ dur: 0.5, vol: 0.3, freq: 600, slide: 100 });
  },
  zap: () => {
    for (let i = 0; i < 6; i++) tone({ freq: 200 + Math.random() * 2000, type: 'square', dur: 0.05, vol: 0.06, delay: i * 0.04, filter: { freq: 2500 } });
  },
  pop: () => tone({ freq: 400, slide: 1200, dur: 0.1, vol: 0.18 }),
  fanfare: () => {
    [62, 66, 69, 74, 69, 74, 78].forEach((m, i) => bell(m + 12, now() + i * 0.15, { vol: 0.09, decay: i === 6 ? 2.5 : 0.8 }));
    choir([62, 66, 69], now() + 0.9, 2.4, { vol: 0.1, bus: sfxBus, vowel: [800, 1300] });
  },
  doom: () => {
    choir([38, 41, 44], now(), 4, { vol: 0.14, bus: sfxBus, vowel: [400, 700] });
    bell(26, now(), { vol: 0.2, decay: 6, ratio: 1.4, index: 4 });
    noise({ dur: 4, vol: 0.2, freq: 200, slide: 60, q: 2, delay: 0.3 });
  },
  reveal: () => {
    noise({ dur: 0.6, vol: 0.2, freq: 4000, slide: 400, q: 1 });
    bell(81, now() + 0.1, { vol: 0.08, decay: 1.2 });
  },
  creak: () => {
    tone({ freq: 70 + Math.random() * 40, slide: 50, type: 'sawtooth', dur: 1.5, vol: 0.05, filter: { freq: 300 }, attack: 0.3, bus: ambientBus });
  },
  whisper: () => noise({ dur: 2.5, vol: 0.06, freq: 2500 + Math.random() * 2000, q: 8, bus: ambientBus }),
  step: () => noise({ dur: 0.06, vol: 0.05, freq: 300, q: 2 }),
  // party touches
  react: () => tone({ freq: 900, slide: 1500, dur: 0.07, vol: 0.035 }),
  cackle: () => [0, 0.15, 0.3, 0.47].forEach((d, i) => tone({ freq: 560 - i * 40, slide: 400 - i * 30, type: 'sawtooth', dur: 0.12, vol: 0.07, delay: d, filter: { freq: 1800 } })),
  thud: () => {
    tone({ freq: 95, slide: 45, dur: 0.35, vol: 0.3 });
    noise({ dur: 0.2, vol: 0.25, freq: 400, q: 1 });
  },
  warn: () => [81, 76].forEach((m, i) => bell(m, now() + i * 0.18, { vol: 0.09, decay: 0.9 })),
  count: () => tick(now(), { vol: 0.07, bus: sfxBus }),
  // more little sounds
  ping: () => [88, 93].forEach((m, i) => bell(m, now() + i * 0.08, { vol: 0.09, decay: 0.6 })), // someone @mentioned you
  join: () => [69, 76, 81].forEach((m, i) => bell(m, now() + i * 0.07, { vol: 0.06, decay: 0.7 })), // a friend boards
  leave: () => [81, 76, 69].forEach((m, i) => bell(m, now() + i * 0.07, { vol: 0.05, decay: 0.6 })),
  pause: () => tone({ freq: 500, slide: 90, dur: 0.6, vol: 0.12, type: 'triangle' }), // tape stops
  resume: () => tone({ freq: 90, slide: 500, dur: 0.45, vol: 0.12, type: 'triangle' }),
  claim: () => [0, 0.12].forEach((d, i) => tone({ freq: [392, 523][i], dur: 0.22, vol: 0.08, delay: d, type: 'sawtooth', filter: { freq: 1400 } })), // a little trumpet
  dread: () => {
    choir([38, 39, 45], now(), 2.2, { vol: 0.12, bus: sfxBus, vowel: [400, 700] });
    heartbeat(now() + 0.2, { vol: 0.3, bus: sfxBus });
  },
  ghost: () => theremin([{ midi: 72, t: now(), dur: 0.5 }, { midi: 79, t: now() + 0.5, dur: 0.5 }, { midi: 67, t: now() + 1, dur: 0.9 }], { vol: 0.08, bus: sfxBus }),
  groove: () => {
    // a funky little bass riff for dancing
    [38, 38, 45, 47, 45, 38, 41, 43].forEach((m, i) => pluck(m, now() + i * 0.16, { vol: 0.16, decay: 0.2, bright: 2200, bus: sfxBus }));
    [0, 0.32, 0.64, 0.96].forEach((d) => noise({ dur: 0.05, vol: 0.06, freq: 6000, q: 2, delay: d + 0.16 }));
  },
  bubbles: () => {
    for (let i = 0; i < 10; i++) tone({ freq: 500 + Math.random() * 900, slide: 1200 + Math.random() * 900, dur: 0.06, vol: 0.05, delay: i * 0.11 + Math.random() * 0.05 });
  },
  boing: () => tone({ freq: 160, slide: 640, dur: 0.28, vol: 0.12, type: 'triangle' }),
  whirl: () => noise({ dur: 0.6, vol: 0.12, freq: 600, slide: 2600, q: 3 }),
  giggle: () => [0, 0.09, 0.18, 0.27].forEach((d, i) => tone({ freq: 700 + (i % 2) * 120, slide: 600, dur: 0.07, vol: 0.06, delay: d, type: 'triangle' })),
  sob: () => tone({ freq: 440, slide: 300, dur: 0.7, vol: 0.07, type: 'triangle' }),
  swish: () => noise({ dur: 0.25, vol: 0.08, freq: 1200, slide: 3000, q: 1 }),
  huh: () => tone({ freq: 300, slide: 420, dur: 0.22, vol: 0.08, type: 'triangle' }),
};


// Sound effects that change with the script. A name listed here replaces the one above while that script is played.
const SCRIPT_SOUNDS = {
  // 🎪 the Carnival: calliope toots, cymbals, a cannon and a slide whistle
  carnival: {
    death: () => {
      [[311, 0], [294, 0.4], [277, 0.8]].forEach(([f, d]) => tone({ freq: f, slide: f * 0.97, type: 'sawtooth', dur: 0.4, vol: 0.1, delay: d, filter: { freq: 1400 } }));
      tone({ freq: 900, slide: 120, type: 'sine', dur: 1.2, vol: 0.1, delay: 1.2 }); // a slide whistle down
      cymbal(now() + 2.2, { vol: 0.08, dur: 1.4 });
    },
    airlock: () => {
      // the human cannon: a boom, then a long whistle as they fly away
      tone({ freq: 90, slide: 28, dur: 0.7, vol: 0.4 });
      noise({ dur: 0.5, vol: 0.4, freq: 500, slide: 90, q: 0.7 });
      tone({ freq: 1500, slide: 260, type: 'sine', dur: 1.5, vol: 0.09, delay: 0.35 });
      cymbal(now() + 1.9, { vol: 0.05, dur: 0.9 });
    },
    dawn: () => [60, 64, 67, 72, 76].forEach((m, i) => calliope(m + 12, now() + i * 0.13, { vol: 0.06, dur: i === 4 ? 0.7 : 0.18, bus: sfxBus, wobble: 10 })),
    night: () => {
      [81, 77, 74, 69, 65].forEach((m, i) => bell(m, now() + i * 0.26, { vol: 0.06, decay: 2.6 })); // the music box winding down
      organ([45, 52], now() + 0.9, 2.4, { vol: 0.05, detune: 30 });
    },
    alarm: () => {
      [0, 0.38, 0.76].forEach((d) => bell(69, now() + d, { vol: 0.17, decay: 1.2, ratio: 1.41, index: 4 }));
      cymbal(now(), { vol: 0.08, dur: 1.5 });
      [48, 55, 60].forEach((m) => calliope(m, now() + 1.2, { vol: 0.06, dur: 0.6, bus: sfxBus, wobble: 18 }));
    },
    task: () => [72, 76, 79, 84, 88].forEach((m, i) => bell(m, now() + i * 0.06, { vol: 0.08, decay: 0.55, ratio: 3, index: 1 })), // a xylophone run
    chime: () => [76, 79, 84, 88].forEach((m, i) => bell(m, now() + i * 0.08, { vol: 0.07, decay: 0.7, ratio: 3, index: 1 })),
    fanfare: () => {
      [60, 64, 67, 72, 67, 72, 76].forEach((m, i) => calliope(m + 12, now() + i * 0.14, { vol: 0.07, dur: i === 6 ? 1.2 : 0.2, bus: sfxBus, wobble: 8 }));
      cymbal(now() + 0.9, { vol: 0.09, dur: 2 });
    },
    doom: () => {
      organ([33, 40, 45], now(), 4, { vol: 0.1, detune: 28 });
      for (let i = 0; i < 5; i++) tone({ freq: 150 - i * 8, slide: 100 - i * 6, type: 'sawtooth', dur: 0.2, vol: 0.07, delay: 0.5 + i * 0.26, filter: { freq: 1500 } }); // ha ha ha
      bell(28, now(), { vol: 0.18, decay: 5, ratio: 1.4, index: 3 });
    },
    reveal: () => {
      for (let i = 0; i < 10; i++) snare(now() + i * 0.05, { vol: 0.03 + i * 0.004 });
      cymbal(now() + 0.55, { vol: 0.07, dur: 1 });
    },
  },
  // 🦠 the Outbreak: monitors, alarms, seals and hisses
  outbreak: {
    death: () => {
      tone({ freq: 1000, dur: 1.8, vol: 0.07, attack: 0.01 }); // a flatline
      heartbeat(now(), { vol: 0.22, bus: sfxBus });
    },
    airlock: () => {
      noise({ dur: 1.6, vol: 0.3, freq: 4200, slide: 1200, q: 0.6, type: 'highpass' }); // a seal hissing shut
      tone({ freq: 80, type: 'square', dur: 0.2, vol: 0.18, delay: 1.3, filter: { freq: 400 } });
      noise({ dur: 0.12, vol: 0.2, freq: 500, delay: 1.3 });
    },
    dawn: () => {
      [0, 0.25].forEach((d) => beep(now() + d, { freq: 1320, dur: 0.1, vol: 0.06 }));
      [74, 81, 86].forEach((m, i) => bell(m, now() + 0.6 + i * 0.12, { vol: 0.06, decay: 1.4 }));
    },
    night: () => {
      heartbeat(now(), { vol: 0.2, bus: sfxBus });
      heartbeat(now() + 1.2, { vol: 0.12, bus: sfxBus });
      tone({ freq: 440, slide: 110, dur: 2, vol: 0.05, delay: 0.3 });
    },
    alarm: () => {
      klaxon(now(), 0.9, { vol: 0.07 });
      klaxon(now() + 1, 0.9, { vol: 0.07 });
    },
    task: () => [1000, 1250, 1500].forEach((f, i) => beep(now() + i * 0.08, { freq: f, dur: 0.07, vol: 0.05 })),
    chime: () => [78, 83, 90].forEach((m, i) => sonar(m, now() + i * 0.1, { vol: 0.05, decay: 1.2 })),
    fanfare: () => [67, 71, 74, 79].forEach((m, i) => bell(m + 12, now() + i * 0.14, { vol: 0.08, decay: i === 3 ? 2.4 : 0.9 })),
    doom: () => {
      klaxon(now(), 1.5, { vol: 0.08 });
      klaxon(now() + 1.6, 1.5, { vol: 0.08 });
      heartbeat(now() + 0.3, { vol: 0.35, bus: sfxBus });
      heartbeat(now() + 1.9, { vol: 0.3, bus: sfxBus });
    },
    reveal: () => {
      for (let i = 0; i < 12; i++) geiger(now() + i * 0.04 + Math.random() * 0.03, { vol: 0.06 });
      sonar(88, now() + 0.3, { vol: 0.06, decay: 1.2 });
    },
  },
  // 🗡️ the Citadel: bells, ravens, organs, great doors and chains
  traitors: {
    death: () => {
      bell(38, now(), { vol: 0.2, decay: 4, ratio: 1.4, index: 3 }); // a funeral toll
      organ([38, 45, 50], now(), 2.6, { vol: 0.06 });
      [0.7, 1.0].forEach((d) => { tone({ freq: 480, slide: 290, type: 'sawtooth', dur: 0.22, vol: 0.05, delay: d, filter: { freq: 1400 } }); }); // a raven caws
    },
    airlock: () => {
      // banished: the great doors boom shut and a portcullis chain rattles
      tone({ freq: 62, slide: 32, dur: 1.4, vol: 0.4 });
      noise({ dur: 1.2, vol: 0.3, freq: 260, slide: 70, q: 1.2, type: 'lowpass', delay: 0.05 });
      for (let i = 0; i < 9; i++) noise({ dur: 0.05, vol: 0.09, freq: 3200 + Math.random() * 1200, q: 3, delay: 0.5 + i * 0.07 });
      bell(33, now() + 0.2, { vol: 0.14, decay: 4, ratio: 1.4, index: 3 });
    },
    dawn: () => {
      [0, 0.55, 1.1].forEach((d, i) => bell([62, 69, 66][i], now() + d, { vol: 0.12, decay: 3, ratio: 1.41, index: 3 })); // the bells peal over the castle
      tone({ freq: 520, slide: 300, type: 'sawtooth', dur: 0.2, vol: 0.04, delay: 1.7, filter: { freq: 1400 } }); // a raven
    },
    night: () => {
      organ([38, 45, 50], now(), 3.2, { vol: 0.06 });
      tone({ freq: 430, dur: 0.4, vol: 0.05, delay: 0.5, type: 'triangle' }); // an owl
      tone({ freq: 360, dur: 0.6, vol: 0.05, delay: 1.1, type: 'triangle' });
    },
    alarm: () => {
      [0, 0.65, 1.3].forEach((d) => bell(50, now() + d, { vol: 0.2, decay: 2.2, ratio: 1.41, index: 4 }));
      organ([50, 57, 62], now(), 2, { vol: 0.07 });
    },
    task: () => [84, 88, 91, 96].forEach((m, i) => bell(m, now() + i * 0.05, { vol: 0.06, decay: 0.5, ratio: 5, index: 1 })), // coins
    chime: () => [62, 66, 69, 74].forEach((m, i) => pluck(m + 12, now() + i * 0.09, { vol: 0.1, decay: 0.9, bright: 3000, bus: sfxBus })),
    fanfare: () => {
      [50, 57, 62, 66, 69].forEach((m, i) => tone({ freq: hz(m), type: 'sawtooth', dur: i === 4 ? 1.6 : 0.3, vol: 0.07, delay: i * 0.18, filter: { freq: 1500 } })); // horns
      [74, 78, 81, 86].forEach((m, i) => bell(m, now() + 0.7 + i * 0.1, { vol: 0.07, decay: 1.8 }));
      timpani(38, now(), { vol: 0.25 });
    },
    doom: () => {
      organ([26, 33, 38], now(), 4.5, { vol: 0.1 });
      bell(26, now(), { vol: 0.22, decay: 6, ratio: 1.4, index: 4 });
      timpani(34, now() + 0.3, { vol: 0.3 });
      timpani(34, now() + 1.3, { vol: 0.22 });
    },
    reveal: () => {
      noise({ dur: 0.7, vol: 0.15, freq: 3000, slide: 300, q: 1 });
      bell(74, now() + 0.12, { vol: 0.09, decay: 2.2, ratio: 2.76, index: 1.5 });
    },
  },
};

export function sfx(name) {
  try {
    sfxListener?.(name);
  } catch {}
  if (!ctx || !enabled) return;
  try {
    (SCRIPT_SOUNDS[scriptId]?.[name] || SOUNDS[name])?.();
  } catch (err) {
    console.warn(`[sound] ${name}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Mood: the music for this part of the game, plus the ship's own noises
// (ventilation hiss, hull creaks and, at night, whispers).
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// The ship's (or the tent's, the ward's, the castle's) own noises, drifting in now and then
// ---------------------------------------------------------------------------
const AIR = {
  classic: { type: 'lowpass', freq: 380, q: 0.7, rate: 0.08, depth: 160, level: 0.12 }, // ventilation
  carnival: { type: 'bandpass', freq: 900, q: 0.5, rate: 0.14, depth: 380, level: 0.1 }, // a crowd and a generator, far away
  outbreak: { type: 'lowpass', freq: 520, q: 1.1, rate: 0.2, depth: 260, level: 0.14 }, // slow, wet breathing
  traitors: { type: 'bandpass', freq: 520, q: 0.7, rate: 0.06, depth: 300, level: 0.15 }, // wind round the towers
};
const AMBIENT_NOISES = {
  classic: { day: [() => SOUNDS.creak()], night: [() => SOUNDS.whisper(), () => SOUNDS.whisper(), () => SOUNDS.creak()] },
  carnival: {
    day: [
      () => tone({ freq: 220, slide: 330, type: 'sawtooth', dur: 0.2, vol: 0.02, filter: { freq: 900 }, bus: ambientBus }), // a distant honk
      () => [60, 64, 67].forEach((m, i) => calliope(m + 12, now() + i * 0.14, { vol: 0.012, dur: 0.15, bus: ambientBus, wobble: 20 })), // a scrap of calliope
    ],
    night: [
      () => [0, 0.11, 0.22].forEach((d) => tone({ freq: 640 + d * 900, slide: 520, dur: 0.07, vol: 0.02, delay: d, type: 'triangle', bus: ambientBus })), // a giggle in the dark
      () => bell(rnd([81, 84, 88]), now(), { vol: 0.02, decay: 2.4, bus: ambientBus }), // a stray music-box note
      () => SOUNDS.creak(),
    ],
  },
  outbreak: {
    day: [
      () => [0, 0.16, 0.3].forEach((d) => noise({ dur: 0.1, vol: 0.03, freq: 420, q: 1.1, delay: d, bus: ambientBus })), // a cough through a wall
      () => beep(now(), { freq: 988, dur: 0.07, vol: 0.012, bus: ambientBus }), // a monitor, down the hall
    ],
    night: [
      () => [0, 0.16, 0.3].forEach((d) => noise({ dur: 0.1, vol: 0.03, freq: 380, q: 1.1, delay: d, bus: ambientBus })),
      () => sonar(rnd([76, 79, 83]), now(), { vol: 0.018, decay: 2.6, bus: ambientBus }),
      () => { for (let i = 0; i < 6; i++) geiger(now() + i * 0.07 + Math.random() * 0.05, { vol: 0.025, bus: ambientBus }); },
    ],
  },
  traitors: {
    day: [
      () => tone({ freq: 470, slide: 290, type: 'sawtooth', dur: 0.22, vol: 0.02, filter: { freq: 1300 }, bus: ambientBus }), // a raven
      () => bell(rnd([50, 53, 57]), now(), { vol: 0.03, decay: 4, ratio: 1.41, index: 3, bus: ambientBus }), // a far-off bell
      () => SOUNDS.creak(),
    ],
    night: [
      () => [0, 0.5].forEach((d, i) => tone({ freq: i ? 360 : 430, dur: 0.45, vol: 0.02, delay: d, type: 'triangle', bus: ambientBus })), // an owl
      () => SOUNDS.whisper(),
      () => bell(rnd([38, 45]), now(), { vol: 0.05, decay: 5, ratio: 1.4, index: 3, bus: ambientBus }),
      () => SOUNDS.creak(),
    ],
  },
};

export function setAmbient(mood, force = false) {
  if (!ctx) return;
  if (ambient?.mood === mood && !force) return;
  if (ambient) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
    setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 4000);
    clearInterval(old.timer);
  }
  startMusic(mood === 'silent' ? null : mood);

  // the place breathing: a soft, filtered air hiss (quieter by day). Each script has its own: the station's
  // ventilation, a fairground crowd far away, a ward's slow ventilators, wind round the castle's towers.
  const air_ = AIR[scriptId] || AIR.classic;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(mood === 'night' || mood === 'doom' ? 0.5 : mood === 'silent' ? 0.0001 : 0.25, ctx.currentTime, 1.5);
  gain.connect(ambientBus);
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer;
  air.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = air_.type;
  f.frequency.value = air_.freq;
  f.Q.value = air_.q;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = air_.rate;
  lfoGain.gain.value = air_.depth;
  lfo.connect(lfoGain).connect(f.frequency);
  const level = ctx.createGain();
  level.gain.value = air_.level;
  air.connect(f).connect(level).connect(gain);
  air.start();
  lfo.start();

  // occasional noises: creaks and whispers on the station, honks and giggles at the fairground, coughs and pings
  // in the ward, ravens, owls and far-off bells at the castle
  const timer = setInterval(() => {
    if (!enabled || mood === 'silent') return;
    const night = mood === 'night';
    if (Math.random() < (night ? 0.25 : 0.12)) {
      const list = (AMBIENT_NOISES[scriptId] || AMBIENT_NOISES.classic)[night ? 'night' : 'day'];
      list[Math.floor(Math.random() * list.length)]();
    }
  }, 2500);
  ambient = { mood, gain, nodes: [air, lfo], timer };
}
