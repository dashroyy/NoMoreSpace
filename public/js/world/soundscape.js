// The soundscape: every room has its own sound, which fades in as you walk
// towards it and out as you leave. The reactor hums and crackles, the engine
// room throbs, hydroponics trickles and drips (with space crickets), the
// medbay monitor beeps, comms hisses static and taps out morse code, the
// galley pot bubbles, the airlock moans, the ship's cat purrs in the crew
// quarters... All synthesised, like every other sound in the game.
//
// It plays through the ambient bus, so the Effects volume and the sound switch
// in Settings apply to it.
import { ambienceKit } from '../audio.js';
import { ROOMS } from './layout.js';

const RANGE = 9; // metres outside a room where you can still hear it
const ROOM_GAIN = 1.8; // overall loudness: measured to sit a few dB under the music
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function distanceToRect(x, z, [x0, z0, x1, z1]) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}

// ---------- building blocks (all take the kit and the room's output gain) ----------

function lfo(kit, param, rate, depth) {
  const o = kit.ctx.createOscillator();
  o.frequency.value = rate;
  const g = kit.ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
  return o;
}

// a steady tone (hums), optionally low-passed and swelling
function drone(kit, out, freq, type, vol, { lp = null, swell = null } = {}) {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  let node = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node = node.connect(f);
  }
  node.connect(g).connect(out);
  o.start();
  const nodes = [o];
  if (swell) nodes.push(lfo(kit, g.gain, swell[0], vol * swell[1]));
  return nodes;
}

// filtered noise (air, static, water, rumble), optionally swelling or sweeping
function hiss(kit, out, type, freq, q, vol, { swell = null, sweep = null, swell2 = null } = {}) {
  const { ctx } = kit;
  const src = ctx.createBufferSource();
  src.buffer = kit.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(0, Math.random() * 1.9); // a different stretch of noise per room
  const nodes = [src];
  if (swell) nodes.push(lfo(kit, g.gain, swell[0], vol * swell[1]));
  if (swell2) nodes.push(lfo(kit, g.gain, swell2[0], vol * swell2[1]));
  if (sweep) nodes.push(lfo(kit, f.frequency, sweep[0], sweep[1]));
  return nodes;
}

// one short note with a quick fade
function blip(kit, out, at, { freq, to = null, dur = 0.06, vol = 0.03, type = 'sine', attack = 0.004 }) {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

// one burst of filtered noise
function burst(kit, out, at, { freq = 2000, q = 1, type = 'bandpass', dur = 0.05, vol = 0.04, attack = 0.003 }) {
  const { ctx } = kit;
  const src = ctx.createBufferSource();
  src.buffer = kit.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 1.5);
  src.stop(at + dur + 0.05);
}

// ---------- each room's sound: a steady bed plus things that happen now and then ----------

const PENTA = [880, 1047, 1175, 1319, 1568, 1760];
const SOUNDS = {
  bridge: {
    gain: 0.5, // everyone waits and meets here: keep it gentle
    bed: (k, o) => [...drone(k, o, 60, 'sine', 0.035), ...drone(k, o, 120, 'triangle', 0.012, { lp: 320 })],
    events: [{ every: [2.5, 6], play: (k, o, t) => [0, 0.09, 0.18].slice(0, 2 + Math.floor(Math.random() * 2)).forEach((d) => blip(k, o, t + d, { freq: rand(1200, 2000), dur: 0.05, vol: 0.018 })) }],
  },
  observation: {
    gain: 1.6,
    // starlight: a slow shimmering chord, and a wind chime now and then
    bed: (k, o) => [...drone(k, o, 523.25, 'sine', 0.006, { swell: [0.07, 0.9] }), ...drone(k, o, 784, 'sine', 0.005, { swell: [0.11, 0.9] }), ...drone(k, o, 1174.7, 'sine', 0.004, { swell: [0.05, 0.9] })],
    events: [{ every: [5, 10], play: (k, o, t) => blip(k, o, t, { freq: pick([1568, 1760, 2093, 2349, 2637]), dur: 2.4, vol: 0.016, attack: 0.01 }) }],
  },
  navigation: {
    bed: (k, o) => drone(k, o, 90, 'sine', 0.025),
    events: [{ every: [2, 4.5], play: (k, o, t) => { for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) blip(k, o, t + i * 0.075, { freq: pick(PENTA), dur: 0.045, vol: 0.016, type: 'triangle' }); } }],
  },
  comms: {
    gain: 3.5,
    bed: (k, o) => hiss(k, o, 'bandpass', 2600, 0.7, 0.03, { swell: [0.23, 0.7] }),
    events: [
      { every: [4, 8], play: (k, o, t) => { // morse code
        let at = t;
        for (let i = 0, n = 5 + Math.floor(Math.random() * 5); i < n; i++) {
          const dash = Math.random() < 0.4;
          blip(k, o, at, { freq: 720, dur: dash ? 0.2 : 0.07, vol: 0.026, attack: 0.008 });
          at += (dash ? 0.2 : 0.07) + (Math.random() < 0.25 ? 0.22 : 0.08);
        }
      } },
      { every: [6, 12], play: (k, o, t) => burst(k, o, t, { freq: 1800, q: 2, dur: 0.28, vol: 0.035 }) }, // squelch
    ],
  },
  medbay: {
    gain: 4.5,
    bed: (k, o) => hiss(k, o, 'lowpass', 900, 0.5, 0.015),
    events: [
      { every: [0.95, 0.95], play: (k, o, t) => blip(k, o, t, { freq: 988, dur: 0.09, vol: 0.028 }) }, // the heart monitor (in time with its screen)
      { every: [5, 9], play: (k, o, t) => burst(k, o, t, { type: 'lowpass', freq: 600, q: 0.5, dur: 1.6, vol: 0.03, attack: 0.6 }) }, // a ventilator sighs
    ],
  },
  galley: {
    bed: (k, o) => [...drone(k, o, 58, 'sine', 0.03), ...drone(k, o, 174, 'triangle', 0.005, { lp: 400 })], // the fridge
    events: [
      { every: [0.35, 1.1], play: (k, o, t) => { const f = rand(160, 380); blip(k, o, t, { freq: f, to: f * 1.8, dur: 0.07, vol: 0.03 }); } }, // the pot bubbling
      { every: [7, 14], play: (k, o, t) => [2600, 3900].forEach((f) => blip(k, o, t, { freq: f, dur: 0.4, vol: 0.012 })) }, // a clink
    ],
  },
  reactor: {
    bed: (k, o) => [...drone(k, o, 55, 'sawtooth', 0.05, { lp: 180, swell: [0.48, 0.5] }), ...drone(k, o, 110, 'sine', 0.02, { swell: [0.48, 0.6] }), ...hiss(k, o, 'bandpass', 300, 2, 0.02)],
    events: [{ every: [1.5, 4], play: (k, o, t) => { // electric crackle
      let at = t;
      for (let i = 0, n = 4 + Math.floor(Math.random() * 5); i < n; i++) {
        burst(k, o, at, { freq: 3500, q: 0.5, dur: rand(0.02, 0.05), vol: 0.045 });
        at += rand(0.03, 0.09);
      }
    } }],
  },
  engine: {
    gain: 0.7,
    bed: (k, o) => [...hiss(k, o, 'lowpass', 160, 0.7, 0.12), ...drone(k, o, 41, 'sine', 0.05, { swell: [1.7, 0.6] }), ...drone(k, o, 82, 'triangle', 0.014, { lp: 220, swell: [1.7, 0.6] })],
    events: [{ every: [6, 12], play: (k, o, t) => { blip(k, o, t, { freq: 140, dur: 0.08, vol: 0.025, type: 'square' }); burst(k, o, t, { freq: 900, q: 1, dur: 0.1, vol: 0.03 }); } }],
  },
  hydroponics: {
    gain: 3.5,
    bed: (k, o) => hiss(k, o, 'bandpass', 2000, 1.2, 0.02, { swell: [3.3, 0.5], swell2: [4.7, 0.3] }), // trickling water
    events: [
      { every: [0.5, 1.5], play: (k, o, t) => blip(k, o, t, { freq: rand(1300, 1700), to: 800, dur: 0.05, vol: 0.022 }) }, // drips
      { every: [3, 7], play: (k, o, t) => { for (let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) blip(k, o, t + i * 0.05, { freq: 4300, dur: 0.025, vol: 0.009 }); } }, // space crickets
    ],
  },
  airlock: {
    gain: 2.5,
    bed: (k, o) => hiss(k, o, 'bandpass', 900, 0.6, 0.03, { sweep: [0.09, 500] }), // wind moaning round the seals
    events: [
      { every: [8, 15], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3000, q: 0.5, dur: 1.8, vol: 0.03, attack: 0.4 }) }, // pressure hiss
      { every: [10, 18], play: (k, o, t) => { blip(k, o, t, { freq: 90, dur: 0.12, vol: 0.035, type: 'square' }); burst(k, o, t, { freq: 600, q: 1, dur: 0.15, vol: 0.035 }); } }, // ka-chunk
    ],
  },
  quarters: {
    gain: 2.5,
    bed: (k, o) => hiss(k, o, 'lowpass', 260, 0.7, 0.07, { swell: [24, 0.7], swell2: [0.32, 0.3] }), // the ship's cat, purring
    events: [
      { every: [3, 6], play: (k, o, t) => { const f = rand(90, 140); blip(k, o, t, { freq: f, to: f * 1.4, dur: 0.25, vol: 0.03, attack: 0.03 }); } }, // the lava lamp
      { every: [2, 4], play: (k, o, t) => { for (let i = 0; i < 3; i++) blip(k, o, t + i * rand(0.06, 0.14), { freq: rand(1800, 2600), dur: 0.02, vol: 0.01 }); } }, // fish tank bubbles
    ],
  },
  cargo: {
    bed: (k, o) => [...hiss(k, o, 'lowpass', 220, 0.7, 0.05), ...drone(k, o, 49, 'sine', 0.02)],
    events: [
      { every: [5, 10], play: (k, o, t) => { blip(k, o, t, { freq: 180, dur: 0.1, vol: 0.025, type: 'square' }); burst(k, o, t, { freq: 2500, q: 2, dur: 0.06, vol: 0.03 }); } }, // something metal shifts
      { every: [9, 16], play: (k, o, t) => [0, 0.32].forEach((d) => blip(k, o, t + d, { freq: 1000, dur: 0.12, vol: 0.014, type: 'triangle' })) }, // a loader reversing
    ],
  },
};

// ---------- the Cosmic Carnival's rooms: a fairground instead of a space station ----------
const SCALE = [523, 587, 659, 784, 880, 1047, 1319]; // a bright major pentatonic
const CARNIVAL_SOUNDS = {
  bridge: {
    gain: 0.5,
    bed: (k, o) => [...drone(k, o, 65, 'sine', 0.03), ...hiss(k, o, 'bandpass', 700, 0.5, 0.008, { swell: [0.2, 0.6] })], // the murmur of a big top
    events: [{ every: [9, 16], play: (k, o, t) => { // a quick drum roll and a cymbal
      for (let i = 0; i < 14; i++) burst(k, o, t + i * 0.055, { type: 'lowpass', freq: 380, q: 0.6, dur: 0.05, vol: 0.012 + i * 0.0013 });
      burst(k, o, t + 0.85, { type: 'highpass', freq: 6000, q: 0.5, dur: 0.9, vol: 0.02, attack: 0.01 });
    } }],
  },
  observation: {
    gain: 1.6,
    bed: (k, o) => [...drone(k, o, 70, 'sine', 0.012, { swell: [0.3, 0.6] }), ...hiss(k, o, 'bandpass', 500, 2, 0.006, { swell: [0.12, 0.7] })], // the wheel creaking round
    events: [
      { every: [7, 12], play: (k, o, t) => [0, 1, 2, 3, 2, 4].forEach((n, i) => blip(k, o, t + i * 0.3, { freq: SCALE[n], dur: 0.5, vol: 0.016, type: 'triangle', attack: 0.01 })) }, // a music-box tune
      { every: [1.1, 1.3], play: (k, o, t) => burst(k, o, t, { freq: 2200, q: 3, dur: 0.02, vol: 0.012 }) }, // ratchet clicks
    ],
  },
  navigation: {
    gain: 1.4,
    bed: (k, o) => [...drone(k, o, 110, 'triangle', 0.008, { lp: 400 }), ...hiss(k, o, 'lowpass', 300, 0.5, 0.01)],
    events: [{ every: [2.8, 2.8], play: (k, o, t) => { // oom-pah-pah, with a waltz tune on top
      blip(k, o, t, { freq: 131, dur: 0.3, vol: 0.03, type: 'triangle' });
      [0.45, 0.9].forEach((d) => [262, 330, 392].forEach((f) => blip(k, o, t + d, { freq: f, dur: 0.18, vol: 0.008, type: 'square' })));
      [0, 0.45, 0.9].forEach((d, i) => blip(k, o, t + d, { freq: pick(SCALE), dur: 0.35 - i * 0.05, vol: 0.016, type: 'triangle' }));
    } }],
  },
  comms: {
    gain: 2.2,
    bed: (k, o) => [...drone(k, o, 220, 'sawtooth', 0.006, { lp: 800, swell: [5, 0.5] }), ...hiss(k, o, 'highpass', 4500, 0.5, 0.008, { swell: [0.4, 0.6] })], // wheezing steam
    events: [
      { every: [3, 6], play: (k, o, t) => { // the calliope plays a jaunty run
        const run = [0, 2, 4, 3, 5, 4, 2, 0].slice(0, 5 + Math.floor(Math.random() * 4));
        run.forEach((n, i) => { blip(k, o, t + i * 0.17, { freq: SCALE[n] / 2, dur: 0.2, vol: 0.016, type: 'sawtooth' }); blip(k, o, t + i * 0.17, { freq: SCALE[n], dur: 0.2, vol: 0.006, type: 'square' }); });
      } },
      { every: [5, 9], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3500, q: 0.5, dur: 0.9, vol: 0.02, attack: 0.1 }) }, // a puff of steam
    ],
  },
  medbay: {
    gain: 3.2,
    bed: (k, o) => hiss(k, o, 'lowpass', 700, 0.5, 0.012),
    events: [
      { every: [3, 7], play: (k, o, t) => blip(k, o, t, { freq: 600, to: 1700, dur: 0.14, vol: 0.026 }) }, // a squeaky toy
      { every: [5, 11], play: (k, o, t) => { blip(k, o, t, { freq: 240, to: 190, dur: 0.22, vol: 0.026, type: 'sawtooth' }); blip(k, o, t + 0.3, { freq: 240, to: 190, dur: 0.3, vol: 0.026, type: 'sawtooth' }); } }, // honk, honk
      { every: [8, 14], play: (k, o, t) => blip(k, o, t, { freq: 180, to: 520, dur: 0.35, vol: 0.022, type: 'triangle' }) }, // boing
    ],
  },
  galley: {
    gain: 1.5,
    bed: (k, o) => hiss(k, o, 'highpass', 5000, 0.5, 0.01, { swell: [0.5, 0.4] }), // the sizzle of the popcorn machine
    events: [
      { every: [0.12, 0.55], play: (k, o, t) => burst(k, o, t, { freq: rand(1200, 2400), q: 1.5, dur: 0.03, vol: 0.03 }) }, // pop!
      { every: [10, 17], play: (k, o, t) => [2400, 3000].forEach((f, i) => blip(k, o, t + i * 0.05, { freq: f, dur: 0.7, vol: 0.012 })) }, // the till dings
    ],
  },
  reactor: {
    bed: (k, o) => [...drone(k, o, 60, 'sawtooth', 0.025, { lp: 220, swell: [0.8, 0.4] }), ...hiss(k, o, 'bandpass', 4000, 3, 0.008)], // the Tesla coils hum
    events: [
      { every: [1, 3], play: (k, o, t) => { // zap!
        let at = t;
        for (let i = 0, n = 5 + Math.floor(Math.random() * 6); i < n; i++) { burst(k, o, at, { freq: 3800, q: 0.5, dur: rand(0.02, 0.05), vol: 0.045 }); at += rand(0.02, 0.07); }
      } },
      { every: [7, 7], play: (k, o, t) => { blip(k, o, t, { freq: 1568, dur: 1.4, vol: 0.02, type: 'triangle', attack: 0.005 }); blip(k, o, t, { freq: 2349, dur: 1, vol: 0.01, type: 'sine' }); } }, // ding! the high striker's bell
    ],
  },
  engine: {
    gain: 1.2,
    bed: (k, o) => [...hiss(k, o, 'lowpass', 180, 0.7, 0.04), ...drone(k, o, 48, 'sine', 0.025)],
    events: [{ every: [7.5, 7.5], play: (k, o, t) => { // a cannon: whistle, then fwump
      blip(k, o, t, { freq: 400, to: 1300, dur: 0.45, vol: 0.012, type: 'triangle' });
      blip(k, o, t + 0.5, { freq: 110, to: 38, dur: 0.4, vol: 0.07 });
      burst(k, o, t + 0.5, { type: 'lowpass', freq: 500, q: 0.5, dur: 0.5, vol: 0.07 });
      for (let i = 0; i < 6; i++) burst(k, o, t + 0.62 + i * 0.05, { freq: rand(2500, 4500), q: 1, dur: 0.03, vol: 0.02 }); // confetti
    } }],
  },
  hydroponics: {
    gain: 3.2,
    bed: SOUNDS.hydroponics.bed, // the fountain
    events: [
      SOUNDS.hydroponics.events[0],
      { every: [1.2, 3.5], play: (k, o, t) => [0, 1].forEach((i) => blip(k, o, t + i * 0.13, { freq: rand(3200, 4200), to: rand(4200, 5000), dur: 0.07, vol: 0.014 })) }, // a bird tweets
    ],
  },
  airlock: {
    gain: 1.8,
    bed: (k, o) => hiss(k, o, 'bandpass', 600, 0.5, 0.012, { swell: [0.25, 0.5] }), // the crowd, waiting
    events: [{ every: [10, 10], play: (k, o, t) => { // drum roll, then BOOM
      for (let i = 0; i < 18; i++) burst(k, o, t + i * 0.05, { type: 'lowpass', freq: 320, q: 0.6, dur: 0.05, vol: 0.012 + i * 0.0015 });
      blip(k, o, t + 1, { freq: 100, to: 36, dur: 0.5, vol: 0.08 });
      burst(k, o, t + 1, { type: 'lowpass', freq: 450, q: 0.5, dur: 0.6, vol: 0.08 });
      burst(k, o, t + 1.1, { type: 'highpass', freq: 5000, q: 0.5, dur: 0.7, vol: 0.025 });
    } }],
  },
  quarters: {
    gain: 2.2,
    bed: (k, o) => hiss(k, o, 'lowpass', 300, 0.7, 0.03, { swell: [0.2, 0.5] }),
    events: [
      { every: [0.2, 0.9], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3000, q: 0.5, dur: 0.02, vol: 0.02 }) }, // a campfire crackles
      { every: [12, 20], play: (k, o, t) => [0, 0.22].forEach((d) => blip(k, o, t + d, { freq: 330, dur: 0.14, vol: 0.026, type: 'sawtooth' })) }, // the clown car horn
    ],
  },
  cargo: {
    gain: 1.5,
    bed: (k, o) => [...hiss(k, o, 'lowpass', 240, 0.7, 0.03), ...drone(k, o, 52, 'sine', 0.012)],
    events: [
      { every: [8, 16], play: (k, o, t) => { blip(k, o, t, { freq: 760, to: 300, dur: 0.3, vol: 0.022, type: 'sawtooth' }); blip(k, o, t + 0.12, { freq: 760, to: 300, dur: 0.25, vol: 0.016, type: 'sawtooth' }); } }, // a rubber chicken squawks
      { every: [6, 12], play: (k, o, t) => { blip(k, o, t, { freq: 150, to: 600, dur: 0.3, vol: 0.02 }); blip(k, o, t + 0.3, { freq: 600, to: 200, dur: 0.3, vol: 0.016 }); } }, // boing
      { every: [5, 9], play: (k, o, t) => [0, 0.2, 0.4].forEach((d) => burst(k, o, t + d, { type: 'lowpass', freq: 500, q: 1, dur: 0.07, vol: 0.03 })) }, // juggling pins thump
    ],
  },
};

// ---------- the Outbreak's rooms: a research lab where something has gone wrong ----------
const CHIME = [659, 523]; // the PA's two-tone "ding-dong"
const geiger = { every: [0.12, 0.9], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3200, q: 0.8, dur: 0.012, vol: 0.04 }) };
const cough = (k, o, t) => { // a muffled cough through a wall
  for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) burst(k, o, t + i * 0.16, { type: 'bandpass', freq: rand(350, 600), q: 1.2, dur: 0.1, vol: 0.03 });
};
const OUTBREAK_SOUNDS = {
  bridge: {
    gain: 0.5,
    bed: (k, o) => [...drone(k, o, 55, 'sine', 0.03), ...hiss(k, o, 'lowpass', 400, 0.5, 0.012, { swell: [0.15, 0.6] })], // the hub's low hum
    events: [
      { every: [1.15, 1.15], play: (k, o, t) => { blip(k, o, t, { freq: 62, dur: 0.12, vol: 0.05 }); blip(k, o, t + 0.22, { freq: 55, dur: 0.12, vol: 0.035 }); } }, // a slow heartbeat
      { every: [14, 24], play: (k, o, t) => CHIME.forEach((f, i) => blip(k, o, t + i * 0.45, { freq: f, dur: 0.9, vol: 0.018, type: 'triangle' })) }, // the PA chimes
    ],
  },
  observation: {
    gain: 1.6,
    bed: (k, o) => [...hiss(k, o, 'bandpass', 900, 0.8, 0.012, { swell: [0.4, 0.6] }), ...drone(k, o, 90, 'sine', 0.01, { swell: [0.2, 0.7] })], // bubbling glass cases
    events: [
      geiger,
      { every: [0.5, 1.4], play: (k, o, t) => blip(k, o, t, { freq: rand(500, 1100), to: rand(200, 500), dur: 0.08, vol: 0.02 }) }, // bubbles
    ],
  },
  navigation: {
    gain: 1.4,
    bed: (k, o) => [...drone(k, o, 180, 'sawtooth', 0.006, { lp: 500, swell: [3.5, 0.5] }), ...hiss(k, o, 'bandpass', 2400, 1.5, 0.006, { swell: [8, 0.5] })], // the centrifuge whirring
    events: [{ every: [0.4, 1.4], play: (k, o, t) => { for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) blip(k, o, t + i * 0.07, { freq: pick(PENTA), dur: 0.04, vol: 0.012, type: 'square' }); } }], // the sequencer chatters
  },
  comms: {
    gain: 2.2,
    bed: (k, o) => hiss(k, o, 'bandpass', 700, 1.2, 0.01, { sweep: [0.12, 350] }), // a siren winding up and down, far off
    events: [
      { every: [5, 8], play: (k, o, t) => { blip(k, o, t, { freq: 440, to: 880, dur: 1.1, vol: 0.02, type: 'triangle', attack: 0.3 }); blip(k, o, t + 1.2, { freq: 880, to: 440, dur: 1.1, vol: 0.02, type: 'triangle', attack: 0.3 }); } }, // WEEE-OOO
      { every: [16, 26], play: (k, o, t) => CHIME.forEach((f, i) => blip(k, o, t + i * 0.45, { freq: f, dur: 0.9, vol: 0.02, type: 'triangle' })) },
    ],
  },
  medbay: {
    gain: 3.2,
    bed: (k, o) => hiss(k, o, 'lowpass', 600, 0.5, 0.014),
    events: [
      { every: [0.8, 1.15], play: (k, o, t) => blip(k, o, t, { freq: 988, dur: 0.09, vol: 0.028 }) }, // heart monitors, not quite in time
      { every: [5, 9], play: (k, o, t) => burst(k, o, t, { type: 'lowpass', freq: 600, q: 0.5, dur: 1.4, vol: 0.03, attack: 0.5 }) }, // a ventilator sighs
      { every: [9, 16], play: (k, o, t) => cough(k, o, t) },
    ],
  },
  galley: {
    gain: 1.5,
    bed: (k, o) => [...drone(k, o, 58, 'sine', 0.02), ...hiss(k, o, 'lowpass', 500, 0.6, 0.012)],
    events: [
      { every: [0.25, 0.9], play: (k, o, t) => { const f = rand(120, 300); blip(k, o, t, { freq: f, to: f * 2.2, dur: 0.12, vol: 0.03 }); } }, // goo, bubbling
      { every: [8, 15], play: (k, o, t) => burst(k, o, t, { type: 'bandpass', freq: 500, q: 1, dur: 0.35, vol: 0.04, attack: 0.02 }) }, // a squelch
    ],
  },
  reactor: {
    gain: 1.2,
    bed: (k, o) => [...hiss(k, o, 'lowpass', 280, 0.6, 0.08, { swell: [0.6, 0.4] }), ...drone(k, o, 46, 'sawtooth', 0.025, { lp: 150 })], // the furnace roars
    events: [{ every: [0.2, 1.1], play: (k, o, t) => burst(k, o, t, { freq: rand(1500, 3200), q: 1.5, dur: 0.03, vol: 0.035 }) }], // fire cracks
  },
  engine: {
    gain: 1.2,
    bed: (k, o) => [...drone(k, o, 110, 'triangle', 0.02, { lp: 300, swell: [5, 0.5] }), ...hiss(k, o, 'lowpass', 600, 0.5, 0.05, { swell: [5.5, 0.5] })], // the big fans chopping the air
    events: [{ every: [9, 16], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 4000, q: 0.5, dur: 1.2, vol: 0.02, attack: 0.3 }) }], // the filters flush
  },
  hydroponics: {
    gain: 3.2,
    bed: (k, o) => [...drone(k, o, 75, 'sine', 0.018, { swell: [0.25, 0.7] }), ...hiss(k, o, 'bandpass', 1200, 1, 0.012, { swell: [0.5, 0.6] })], // a damp, living hum
    events: [
      { every: [0.4, 1.6], play: (k, o, t) => blip(k, o, t, { freq: rand(250, 600), to: rand(700, 1200), dur: 0.09, vol: 0.024 }) }, // wet pops
      { every: [4, 9], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3500, q: 0.5, dur: 0.7, vol: 0.02, attack: 0.15 }) }, // a puff of spores
    ],
  },
  airlock: {
    gain: 1.8,
    bed: (k, o) => hiss(k, o, 'highpass', 4000, 0.5, 0.012, { swell: [0.3, 0.5] }), // the decon shower
    events: [
      { every: [8, 14], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3000, q: 0.5, dur: 1.6, vol: 0.03, attack: 0.3 }) }, // a valve hisses
      { every: [12, 18], play: (k, o, t) => { blip(k, o, t, { freq: 90, dur: 0.12, vol: 0.035, type: 'square' }); burst(k, o, t, { freq: 600, q: 1, dur: 0.15, vol: 0.035 }); } }, // ka-chunk
    ],
  },
  quarters: {
    gain: 2.2,
    bed: (k, o) => hiss(k, o, 'lowpass', 280, 0.7, 0.025, { swell: [0.18, 0.5] }),
    events: [
      { every: [7, 13], play: (k, o, t) => cough(k, o, t) },
      { every: [2.5, 4], play: (k, o, t) => blip(k, o, t, { freq: 988, dur: 0.07, vol: 0.016 }) }, // a monitor, down the hall
    ],
  },
  cargo: {
    gain: 1.5,
    bed: (k, o) => [...drone(k, o, 50, 'sine', 0.03), ...hiss(k, o, 'lowpass', 220, 0.7, 0.04)], // freezers humming
    events: [
      { every: [0.5, 2.2], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 4500, q: 1, dur: 0.015, vol: 0.03 }) }, // ice crackles
      { every: [8, 14], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3000, q: 0.5, dur: 1.4, vol: 0.025, attack: 0.3 }) }, // frost hiss
    ],
  },
};

// ---------- the disaster outside: a bed that grows as it gets closer, and one-off cues ----------
// bed(kit, out) builds the steady sound; tune(nodes, p, kit) (optional) retunes it as the end nears.
const MINOR = [392, 466, 392, 349, 311, 349, 392, 523]; // a music-box lullaby in a minor key
const DOOM_SOUNDS = {
  // 🕳️ the black hole: a deep sub-bass and a metal whine that climbs as it gets closer
  classic: {
    gain: 0.7,
    bed: (k, o) => [
      ...drone(k, o, 38, 'sine', 0.06, { swell: [0.07, 0.5] }),
      ...drone(k, o, 57, 'triangle', 0.014, { lp: 220, swell: [0.11, 0.7] }),
      ...hiss(k, o, 'lowpass', 150, 0.6, 0.06, { swell: [0.13, 0.5] }),
      ...drone(k, o, 300, 'sine', 0.005, {}), // the whine (always the last node): higher as it nears
    ],
    tune: (nodes, p, k) => {
      const whine = nodes[nodes.length - 1];
      whine.frequency.setTargetAtTime(300 + p * 520, k.ctx.currentTime, 2);
    },
    // a shudder: a long, low boom, a groan of metal and a slide down
    cue: (k, o, t, power) => {
      blip(k, o, t, { freq: 52, to: 28, dur: 1.8, vol: 0.12 * power, type: 'sine', attack: 0.04 });
      burst(k, o, t, { type: 'lowpass', freq: 220, q: 0.6, dur: 1.6, vol: 0.1 * power, attack: 0.05 });
      blip(k, o, t + 0.15, { freq: 640, to: 320, dur: 0.9, vol: 0.012 * power, type: 'square' });
      blip(k, o, t + 0.5, { freq: 140, to: 70, dur: 1.1, vol: 0.02 * power, type: 'sawtooth' });
    },
  },
  // 🤡 the Great Grin: a lullaby that is slightly out of tune, a slow heartbeat, a wheezing organ
  carnival: {
    gain: 1,
    bed: (k, o) => [
      ...drone(k, o, 55, 'sawtooth', 0.012, { lp: 170, swell: [0.1, 0.5] }),
      ...drone(k, o, 233, 'sawtooth', 0.0035, { lp: 700, swell: [0.2, 0.6] }), // two pipes a hair apart: they beat
      ...drone(k, o, 237.2, 'sawtooth', 0.0035, { lp: 700 }),
      ...hiss(k, o, 'bandpass', 900, 0.6, 0.008, { swell: [0.15, 0.7] }),
    ],
    events: [
      { every: [1.1, 1.1], play: (k, o, t) => { blip(k, o, t, { freq: 58, dur: 0.14, vol: 0.05 }); blip(k, o, t + 0.2, { freq: 52, dur: 0.14, vol: 0.035 }); } }, // thump-thump
      { every: [14, 26], play: (k, o, t) => MINOR.forEach((f, i) => blip(k, o, t + i * 0.62, { freq: f * (i % 3 === 2 ? 0.96 : 1), to: f * 0.985, dur: 0.9, vol: 0.011, type: 'triangle', attack: 0.01 })) },
    ],
    // it laughs: a mocking ha-ha-ha, low and rasping, with a high music-box plink on top
    cue: (k, o, t, power) => {
      power *= 1.6;
      for (let i = 0; i < 5; i++) {
        blip(k, o, t + i * 0.24, { freq: 150 - i * 7, to: 105 - i * 6, dur: 0.18, vol: 0.05 * power, type: 'sawtooth', attack: 0.015 });
        burst(k, o, t + i * 0.24, { type: 'bandpass', freq: 500, q: 1.5, dur: 0.12, vol: 0.03 * power });
      }
      blip(k, o, t + 1.35, { freq: 1568, to: 1480, dur: 1.2, vol: 0.012 * power, type: 'triangle' });
    },
  },
  // 🦠 the Bloom: wet breathing, a sick tremolo hum, crackling spores, thunder inside the cloud
  outbreak: {
    gain: 1,
    bed: (k, o) => [
      ...hiss(k, o, 'bandpass', 420, 0.8, 0.07, { swell: [0.19, 0.9] }), // breathing in and out
      ...drone(k, o, 62, 'sine', 0.03, { swell: [5.5, 0.6] }),
      ...hiss(k, o, 'highpass', 5000, 0.5, 0.006, { swell: [0.4, 0.8] }),
    ],
    events: [
      { every: [0.25, 1.1], play: (k, o, t) => burst(k, o, t, { type: 'highpass', freq: 3000, q: 0.8, dur: 0.012, vol: 0.03 }) }, // spores crackle
      { every: [6, 14], play: (k, o, t) => blip(k, o, t, { freq: rand(120, 200), to: rand(300, 520), dur: 0.35, vol: 0.03, type: 'sine' }) }, // a wet gurgle
    ],
    // lightning: a crack, then thunder rolling through the gas
    cue: (k, o, t, power) => {
      burst(k, o, t, { type: 'highpass', freq: 2500, q: 0.5, dur: 0.18, vol: 0.09 * power, attack: 0.002 });
      burst(k, o, t + 0.1, { type: 'lowpass', freq: 130, q: 0.6, dur: 2.6, vol: 0.12 * power, attack: 0.15 });
      blip(k, o, t + 0.1, { freq: 70, to: 38, dur: 1.8, vol: 0.07 * power, type: 'sine', attack: 0.1 });
    },
  },
};

// how loud the disaster is in each phase
const DOOM_PHASE = { home: 0, lobby: 0, roam: 1, meeting: 0.9, nominations: 0.9, lastwords: 0.8, dusk: 0.9, dawn: 1, night: 1.3, ended: 0.4 };

// how loud the ship is in each phase (seated phases listen from the bridge)
const PHASE_LEVEL = { home: 0, lobby: 1, roam: 1, meeting: 0.6, nominations: 0.5, lastwords: 0.5, dusk: 0.6, dawn: 0.6, ended: 0.45 };

export class Soundscape {
  constructor() {
    this.rooms = null;
    this.last = 0;
    this.script = 'classic';
    this.doom = null; // the disaster's own bed: { out, nodes, events, level }
    this.progress = 0;
    this.phase = 'home';
  }

  // (re)build the disaster's steady sound for this script
  buildDoom() {
    const kit = this.kit;
    const def = DOOM_SOUNDS[this.script] || DOOM_SOUNDS.classic;
    if (this.doom) {
      for (const n of this.doom.nodes) {
        try { n.stop(); } catch {}
      }
    } else {
      const out = kit.ctx.createGain();
      out.gain.value = 0;
      out.connect(kit.bus);
      this.doom = { out, nodes: [], events: [], level: 0 };
    }
    const nodes = def.bed(kit, this.doom.out);
    this.doom.nodes = nodes;
    const now = kit.ctx.currentTime;
    this.doom.events = (def.events || []).map((e) => ({ ...e, next: now + rand(0.2, e.every[1]) }));
    this.doom.level = -1;
    def.tune?.(nodes, this.progress, kit);
  }

  // a one-off from the disaster: the black hole shudders, the Grin laughs, the Bloom throws lightning
  doomCue(id, power = 1) {
    const kit = ambienceKit();
    if (!kit || !kit.enabled() || kit.ctx.state !== 'running') return;
    if ((DOOM_PHASE[this.phase] ?? 0) === 0) return;
    const def = DOOM_SOUNDS[id] || DOOM_SOUNDS.classic;
    const out = kit.ctx.createGain();
    out.gain.value = 1.4;
    out.connect(kit.bus);
    def.cue(kit, out, kit.ctx.currentTime + 0.02, Math.min(1.3, power));
    setTimeout(() => out.disconnect(), 5000);
  }

  // which set of room sounds this ship plays (the Cosmic Carnival has its own)
  defs() {
    return this.script === 'carnival' ? CARNIVAL_SOUNDS : this.script === 'outbreak' ? OUTBREAK_SOUNDS : SOUNDS;
  }

  setScript(id) {
    id = id || 'classic';
    if (id === this.script) return;
    this.script = id;
    if (this.doom && this.kit) this.buildDoom();
    if (!this.rooms) return; // not started yet: start() will use it
    const defs = this.defs();
    const now = this.kit.ctx.currentTime;
    for (const room of this.rooms) {
      for (const n of room.nodes) {
        try { n.stop(); } catch {}
      }
      const def = defs[room.id];
      room.nodes = def.bed(this.kit, room.out);
      room.gain = ROOM_GAIN * (def.gain || 1);
      room.level = -1; // force the volume to be set again
      room.events = (def.events || []).map((e) => ({ ...e, next: now + rand(0.2, e.every[1]) }));
    }
  }

  start(kit) {
    this.kit = kit;
    this.buildDoom();
    const defs = this.defs();
    this.rooms = ROOMS.filter((r) => defs[r.id]).map((r) => {
      const out = kit.ctx.createGain();
      out.gain.value = 0;
      out.connect(kit.bus);
      const def = defs[r.id];
      const nodes = def.bed(kit, out);
      const now = kit.ctx.currentTime;
      return { id: r.id, rect: r.rect, out, nodes, level: 0, gain: ROOM_GAIN * (def.gain || 1), events: (def.events || []).map((e) => ({ ...e, next: now + rand(0.2, e.every[1]) })) };
    });
  }

  // called every frame from the world; does its work ten times a second
  update({ x, z, phase, night = false, progress = 0 }) {
    const kit = ambienceKit();
    if (!kit) return;
    if (!this.rooms) this.start(kit);
    const now = kit.ctx.currentTime;
    if (now - this.last < 0.1) return;
    this.last = now;
    const on = kit.enabled() && kit.ctx.state === 'running';
    this.phase = phase;
    this.progress = progress;
    // the disaster outside: always there once the game starts, louder the closer it gets
    if (this.doom) {
      const def = DOOM_SOUNDS[this.script] || DOOM_SOUNDS.classic;
      const level = (DOOM_PHASE[phase] ?? 0.5) * (0.15 + 0.85 * progress);
      if (Math.abs(level - this.doom.level) > 0.004) {
        this.doom.out.gain.setTargetAtTime(level * def.gain, now, 0.8);
        if (Math.abs(progress - (this.doom.lastTune ?? -1)) > 0.03) {
          def.tune?.(this.doom.nodes, progress, kit);
          this.doom.lastTune = progress;
        }
        this.doom.level = level;
      }
      for (const e of this.doom.events) {
        if (e.next < now - 1) e.next = now + rand(0, e.every[1]);
        while (e.next <= now + 0.15) {
          if (on && level > 0.02) {
            try {
              e.play(kit, this.doom.out, Math.max(now + 0.01, e.next));
            } catch {}
          }
          e.next += rand(e.every[0], e.every[1]);
        }
      }
    }
    for (const room of this.rooms) {
      let level;
      if (night) level = 0.025; // the camera floats high over the whole ship: a faint mix of everything
      else {
        const d = distanceToRect(x, z, room.rect);
        level = (d <= 0 ? 1 : Math.max(0, 1 - d / RANGE) ** 1.5 * 0.6) * (PHASE_LEVEL[phase] ?? 0.5);
      }
      if (Math.abs(level - room.level) > 0.005) {
        room.out.gain.setTargetAtTime(level * room.gain, now, 0.35);
        room.level = level;
      }
      for (const e of room.events) {
        if (e.next < now - 1) e.next = now + rand(0, e.every[1]); // we were away (hidden tab): don't play a backlog
        while (e.next <= now + 0.15) {
          if (on && level > 0.02) {
            try {
              e.play(kit, room.out, Math.max(now + 0.01, e.next));
            } catch {}
          }
          e.next += rand(e.every[0], e.every[1]);
        }
      }
    }
  }

  // a one-off sound at a spot on the ship (a steam vent, Sweepy chirping)
  oneShot(kind, at, listener) {
    const kit = ambienceKit();
    if (!kit || !kit.enabled() || kit.ctx.state !== 'running') return;
    const level = Math.max(0, 1 - Math.hypot(at.x - listener.x, at.z - listener.z) / 14) ** 2;
    if (level < 0.03) return;
    const out = kit.ctx.createGain();
    out.gain.value = level;
    out.connect(kit.bus);
    const t = kit.ctx.currentTime + 0.01;
    if (kind === 'vent') burst(kit, out, t, { freq: 2600, q: 0.6, dur: 1.3, vol: 0.06, attack: 0.04 });
    if (kind === 'chirp') {
      blip(kit, out, t, { freq: 1600, to: 2300, dur: 0.07, vol: 0.03, type: 'triangle' });
      blip(kit, out, t + 0.1, { freq: 2400, dur: 0.05, vol: 0.025, type: 'triangle' });
    }
    setTimeout(() => out.disconnect(), 2500);
  }
}
