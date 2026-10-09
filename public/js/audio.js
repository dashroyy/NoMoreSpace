// Every sound in the game is synthesised with the Web Audio API: no files to download.
//
// The music is an original, generative score: a haunted music-box waltz with
// a theremin singing over it, choir pads, pizzicato and ticking clocks. Think
// a gothic lullaby drifting through space. Each mood has its own arrangement
// and the melodies are composed on the fly, so no two games sound the same.

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
  if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.4);
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
  sfxBus.gain.value = 0.6;
  sfxBus.connect(master);
  const sfxVerb = ctx.createGain();
  sfxVerb.gain.value = 0.18;
  sfxBus.connect(sfxVerb).connect(reverb);

  ambientBus = ctx.createGain();
  ambientBus.gain.value = 0.35;
  ambientBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? MUSIC_LEVEL : 0;
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

// ---------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------

// Chords (MIDI notes) in D minor, with the gothic C# of the harmonic minor on A.
const CH = {
  Dm: [50, 53, 57], Dm9: [50, 53, 57, 64], Gm: [43, 46, 50], Gm6: [43, 46, 50, 52], Bb: [46, 50, 53], Bbmaj7: [46, 50, 53, 57],
  C: [48, 52, 55], F: [41, 45, 48], A: [45, 49, 52], A7: [45, 49, 52, 55], Asus: [45, 50, 52], Eb: [39, 43, 46], Cdim: [49, 52, 55],
  Bbm: [46, 49, 53], D: [50, 54, 57], G: [43, 47, 50], Bm: [47, 50, 54], Em: [52, 55, 59],
};
const MINOR = [2, 4, 5, 7, 9, 10, 0]; // D natural minor (pitch classes)
const MAJOR = [2, 4, 6, 7, 9, 11, 1]; // D major

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
  const def = MOODS[name];
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
              const useBell = mel.instrument === 'bell' || (mel.instrument === 'alternate' && state.phrases % 2 === 1);
              if (useBell) for (const n of notes) bell(n.midi, n.t, { vol: mel.vol, decay: Math.min(2.2, n.dur + 0.8), bus: gain });
              else theremin(notes, { vol: mel.vol, bus: gain });
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
};

export function sfx(name) {
  if (!ctx || !enabled) return;
  try {
    SOUNDS[name]?.();
  } catch {}
}

// ---------------------------------------------------------------------------
// Mood: the music for this part of the game, plus the ship's own noises
// (ventilation hiss, hull creaks and, at night, whispers).
// ---------------------------------------------------------------------------

export function setAmbient(mood) {
  if (!ctx) return;
  if (ambient?.mood === mood) return;
  if (ambient) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
    setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 4000);
    clearInterval(old.timer);
  }
  startMusic(mood === 'silent' ? null : mood);

  // the ship breathing: a soft, filtered air hiss (quieter by day)
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(mood === 'night' || mood === 'doom' ? 0.5 : mood === 'silent' ? 0.0001 : 0.25, ctx.currentTime, 1.5);
  gain.connect(ambientBus);
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer;
  air.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 160;
  lfo.connect(lfoGain).connect(f.frequency);
  const level = ctx.createGain();
  level.gain.value = 0.12;
  air.connect(f).connect(level).connect(gain);
  air.start();
  lfo.start();

  // occasional creaks and whispers
  const timer = setInterval(() => {
    if (!enabled || mood === 'silent') return;
    if (Math.random() < (mood === 'night' ? 0.25 : 0.12)) SOUNDS[mood === 'night' && Math.random() < 0.6 ? 'whisper' : 'creak']();
  }, 2500);
  ambient = { mood, gain, nodes: [air, lfo], timer };
}
