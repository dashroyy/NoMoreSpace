// The Holo-Jester's hallucinations. Only the victim's browser draws these,
// so to them it all looks real: crewmates who don't exist (with very
// trustworthy names), impossible things drifting under the ship, and
// whispers from nobody. Everyone else sees an ordinary day.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { ROOMS, walkable } from './layout.js';

const NAMES = ['Definitely Real Dave', 'Kevin?', 'Gary From Accounts', 'A Normal Crewmate', 'Space Steve', 'Mr. Wobbles', 'Not The Parasite', 'Trevor', 'Captain Obvious', 'Your Biggest Fan'];
const LINES = [
  "I'm the Medic, trust me 😉",
  'Have you seen my duck?',
  'Bloop.',
  "I've been here the whole time.",
  'Vote for whoever is wearing a hat.',
  'The ducks know.',
  "Shh. I'm not here.",
  'Is it just me, or is that black hole getting closer?',
  "I'm the Gunner. Pew pew.",
  "Don't tell anyone, but I'm imaginary.",
  'Nice suit. Is it real?',
  '*plays a tiny kazoo*',
  'Have you tried turning the ship off and on again?',
  'I saw EVERYTHING. Well, mostly ducks.',
];
const WHISPERS = [
  'psst… the ducks are watching.',
  '…did you hear the whale?',
  'someone ate the last space noodles.',
  "…it was me. I'm the Parasite. jk. unless?",
  'beep boop.',
  '🎺 *a distant kazoo*',
  'the walls are humming your name.',
  'have you counted the crew lately?',
];
// Things that drift straight through the ship, walls and all: [emoji, size, count]
const ODDITIES = [
  ['🐋', 14, 1],
  ['🦆', 4.5, 7],
  ['🐄', 9, 1],
  ['🍕', 7, 1],
  ['🎂', 8, 1],
  ['🪑', 6, 3],
];

// A small seeded random generator, so the hallucination stays the same all day.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (list, r) => list[Math.floor(r() * list.length)];

function emojiSprite(emoji, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 128, 140);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

function spotIn(room, r) {
  const [x0, z0, x1, z1] = room.rect;
  for (let i = 0; i < 20; i++) {
    const x = x0 + 2 + r() * (x1 - x0 - 4);
    const z = z0 + 2 + r() * (z1 - z0 - 4);
    if (walkable(x, z)) return { x, z };
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

export class Hallucinations {
  constructor(world) {
    this.world = world;
    this.seed = null;
    this.phantoms = [];
    this.oddities = [];
    this.onWhisper = null; // main.js: show a chat line
    this.nextWhisper = 0;
  }

  // fx: { seed } when this player is hallucinating today, otherwise null
  set(fx, phase) {
    const seed = fx?.seed ?? null;
    this.phase = phase;
    if (seed !== this.seed) {
      this.clear();
      this.seed = seed;
      if (seed != null) this.build(seed);
    }
    for (const ph of this.phantoms) {
      ph.avatar.root.visible = phase === 'roam';
      if (ph.avatar.pet) ph.avatar.pet.visible = phase === 'roam';
    }
    for (const o of this.oddities) o.sprite.visible = !['night', 'lobby', 'ended'].includes(phase);
  }

  build(seed) {
    const r = rng(seed);
    this.r = r;
    const data = this.world.data;
    const suits = Object.keys(data.suits);
    const names = NAMES.slice();
    for (let i = 0; i < 2; i++) {
      const name = names.splice(Math.floor(r() * names.length), 1)[0];
      const look = { suit: pick(suits, r), hat: pick(data.hats, r), visor: pick(Object.keys(data.visors), r), pet: r() < 0.5 ? pick(data.pets, r) : 'none' };
      const avatar = new Avatar({ look, name, suits: data.suits, visors: data.visors });
      avatar.addedTo(this.world.scene);
      const room = pick(ROOMS, r);
      const at = spotIn(room, r);
      avatar.root.position.set(at.x, 0, at.z);
      this.phantoms.push({ avatar, name, room, goal: at, wait: 2 + r() * 4, hop: 18 + r() * 20, talkAt: 0 });
    }
    // two impossible things float through the ship along a row of rooms
    const kinds = ODDITIES.slice();
    const rows = [-24, 0, 24];
    for (let i = 0; i < 2; i++) {
      const [emoji, size, count] = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
      const z = rows.splice(Math.floor(r() * rows.length), 1)[0] + (r() - 0.5) * 6;
      const y = 2.6 + size * 0.15;
      const speed = 2.5 + r() * 1.5;
      const dir = r() < 0.5 ? 1 : -1;
      for (let k = 0; k < count; k++) {
        const sprite = emojiSprite(emoji, size);
        this.world.scene.add(sprite);
        this.oddities.push({ sprite, z: z + (k % 2) * 2, y: y - (k % 3) * 0.5, speed, dir, offset: -k * size * 1.3, bob: r() * 6, spin: emoji === '🐄' });
      }
    }
    this.nextWhisper = 25 + r() * 30;
  }

  clear() {
    for (const ph of this.phantoms) ph.avatar.dispose();
    for (const o of this.oddities) {
      this.world.scene.remove(o.sprite);
      o.sprite.material.map.dispose();
      o.sprite.material.dispose();
    }
    this.phantoms = [];
    this.oddities = [];
  }

  update(dt, t) {
    if (this.seed == null) return;
    const r = this.r;
    const me = this.world.local;
    // oddities cruise from one side of the ship to the other, forever
    for (const o of this.oddities) {
      const span = 130;
      const x = ((((t * o.speed + o.offset) % span) + span) % span) - span / 2;
      o.sprite.position.set(x * o.dir, o.y + Math.sin(t * 0.5 + o.bob) * 1.2, o.z);
      if (o.spin) o.sprite.material.rotation = t * 0.6;
    }
    if (this.phase !== 'roam') return;
    for (const ph of this.phantoms) {
      const a = ph.avatar;
      const p = a.root.position;
      ph.hop -= dt;
      if (ph.hop <= 0) {
        // blink into another room, as hallucinations do
        this.world.addBeam(p.x, p.z);
        ph.room = pick(ROOMS, r);
        ph.goal = spotIn(ph.room, r);
        p.set(ph.goal.x, 0, ph.goal.z);
        this.world.addBeam(p.x, p.z);
        ph.hop = 20 + r() * 25;
      }
      const dx = ph.goal.x - p.x;
      const dz = ph.goal.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.2) {
        const step = Math.min(d, 2.8 * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        a.root.rotation.y = Math.atan2(dx, dz);
        a.moving = true;
      } else {
        a.moving = false;
        ph.wait -= dt;
        if (ph.wait <= 0) {
          ph.goal = spotIn(ph.room, r);
          ph.wait = 2 + r() * 5;
          if (r() < 0.3) a.emote(pick(['dance', 'wave', 'spin', 'jump'], r));
        }
      }
      // they love a chat when you come close
      if (Math.hypot(me.x - p.x, me.z - p.z) < 6 && t > ph.talkAt) {
        ph.talkAt = t + 9 + r() * 6;
        const line = pick(LINES, r);
        a.say(line);
        this.onWhisper?.({ from: null, name: ph.name, text: line, channel: 'near', at: Date.now() });
      }
      a.update(dt, t);
    }
    // and now and then, a whisper from nobody
    this.nextWhisper -= dt;
    if (this.nextWhisper <= 0) {
      this.nextWhisper = 40 + r() * 35;
      this.onWhisper?.({ from: null, name: '???', text: pick(WHISPERS, r), channel: 'near', at: Date.now() });
    }
  }
}
