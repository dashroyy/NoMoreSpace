// Astronaut avatars, built from simple shapes. Everyone wears the same suit
// shape (so nobody can tell roles apart); colours, hats and pets are cosmetic.
import * as THREE from 'three';
import { fillTextIcons, strokeTextIcons } from '../icons.js';
import { outlineGroup, outlineEach, setOutlinesVisible } from './outline.js';

// Shared shapes for the spacesuit: a chunky little astronaut with a big round glass helmet (head and body are about
// the same size, which is what makes the silhouette easy to recognise from across the ship).
const geo = {
  torso: new THREE.CapsuleGeometry(0.27, 0.1, 6, 18),
  leg: new THREE.CapsuleGeometry(0.115, 0.12, 4, 10),
  cuff: new THREE.TorusGeometry(0.12, 0.032, 6, 14),
  boot: new THREE.SphereGeometry(0.15, 14, 10),
  arm: new THREE.CapsuleGeometry(0.09, 0.14, 4, 10),
  glove: new THREE.SphereGeometry(0.115, 12, 10),
  pad: new THREE.SphereGeometry(0.135, 12, 8),
  belt: new THREE.TorusGeometry(0.285, 0.04, 6, 24),
  neck: new THREE.TorusGeometry(0.3, 0.06, 8, 24),
  helmet: new THREE.SphereGeometry(0.47, 32, 24),
  head: new THREE.SphereGeometry(0.37, 20, 16),
  eye: new THREE.SphereGeometry(0.082, 12, 10),
  glint: new THREE.SphereGeometry(0.08, 10, 6),
  ridge: new THREE.TorusGeometry(0.478, 0.028, 6, 28, Math.PI),
  panel: new THREE.BoxGeometry(0.26, 0.17, 0.05),
  button: new THREE.SphereGeometry(0.024, 6, 5),
  tank: new THREE.CylinderGeometry(0.1, 0.1, 0.44, 14),
  tankCap: new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  packBox: new THREE.BoxGeometry(0.4, 0.34, 0.14),
  lamp: new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10),
  pod: new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16),
  antenna: new THREE.CylinderGeometry(0.014, 0.014, 0.22, 5),
  tip: new THREE.SphereGeometry(0.04, 8, 6),
  particle: new THREE.SphereGeometry(0.06, 6, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const SUIT_SCALE = 0.88;
const HAT_SCALE = 1.32; // hats are built for a small helmet; this fits them to the big one
const OUTLINE = 0.022; // width of the dark cartoon outline
const SHARED_GEOMETRY = new Set(Object.values(geo));

// Free the graphics memory used by throwaway objects (speech bubbles,
// particles, death effects). Shared suit shapes are kept.
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !SHARED_GEOMETRY.has(o.geometry)) o.geometry.dispose();
    for (const m of [o.material].flat()) {
      if (!m || m.userData.shared) continue;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
  });
  obj.removeFromParent();
}

// scratch vectors so the per-frame pet update does not allocate
const _forward = new THREE.Vector3();
const _side = new THREE.Vector3();
const _want = new THREE.Vector3();

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------------------
// Little extras every avatar shares: a soft blob shadow (so they sit on the floor instead of floating over it),
// a heart for the heart emote, and which emotes are dances (dancers get a pulsing spotlight on the floor)
// ---------------------------------------------------------------------------

const softTexture = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const shadowGeometry = new THREE.PlaneGeometry(1.5, 1.5);
const glowGeometry = new THREE.PlaneGeometry(2.8, 2.8);
const heartGeometry = (() => {
  const h = new THREE.Shape();
  h.moveTo(0, -0.55);
  h.bezierCurveTo(-0.9, 0, -0.55, 0.65, 0, 0.2);
  h.bezierCurveTo(0.55, 0.65, 0.9, 0, 0, -0.55);
  const g = new THREE.ExtrudeGeometry(h, { depth: 0.2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
  g.center();
  g.scale(0.2, 0.2, 0.2);
  return g;
})();

SHARED_GEOMETRY.add(shadowGeometry);
SHARED_GEOMETRY.add(glowGeometry);
SHARED_GEOMETRY.add(heartGeometry);
if (softTexture) softTexture.userData.shared = true;

// how long each emote lasts, in seconds (the dances are long enough to enjoy)
const EMOTE_SECONDS = {
  faint: 3.5, levitate: 3, moonwalk: 2.6, grow: 2.5, shrink: 2.5, dance: 3, chicken: 2.6, scooby: 3.4, scuba: 3.6,
  floss: 4.5, robot: 4, disco: 4.5, breakdance: 4, twist: 4, cheer: 2.6, clap: 3, bow: 2.4, flex: 3, facepalm: 2.4,
  salute: 2.2, heart: 3.4, sleep: 4.5, gasp: 1.2, jump: 1.2,
};
export const DANCE_EMOTES = new Set(['dance', 'scooby', 'scuba', 'floss', 'robot', 'disco', 'breakdance', 'twist', 'moonwalk']);

// ---------------------------------------------------------------------------
// Text sprites (name labels, speech bubbles)
// ---------------------------------------------------------------------------

export function makeTextSprite(text, { color = '#ffffff', size = 34, bg = null, maxWidth = 360, padding = 14, scale = 0.012, border = null } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // terminal font: VT323 is small for its size, so draw it bigger and shrink the sprite to match
  const k = 1.4;
  scale /= k;
  padding *= k;
  size = Math.round(size * k);
  maxWidth *= k;
  ctx.font = `600 ${size}px 'Chakra Petch', VT323, ui-monospace, monospace`;
  // a little air between letters: VT323 is narrow and gets hard to read when small
  const spacing = `${Math.round(size * 0.05)}px`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
  // word wrap
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  const width = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width))) + padding * 2;
  const height = lines.length * size * 1.25 + padding * 2;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  ctx.font = `${size}px VT323, ui-monospace, monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
  if (bg) {
    ctx.fillStyle = bg;
    const r = Math.min(24, height / 2);
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, r);
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (!bg) {
    // a dark outline so names stay readable over bright floors and lights
    ctx.strokeStyle = 'rgba(2, 4, 12, 0.92)';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => strokeTextIcons(ctx, l, width / 2, padding + i * size * 1.25));
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
  }
  lines.forEach((l, i) => fillTextIcons(ctx, l, width / 2, padding + i * size * 1.25));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(width * scale, height * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---------------------------------------------------------------------------
// Hats
// ---------------------------------------------------------------------------

export const HAT_LABELS = {
  none: 'None', party: '🥳 Party', antenna: '📡 Antenna', crown: '👑 Crown', halo: '😇 Halo', tophat: '🎩 Top hat', catears: '🐱 Cat ears',
  chef: '👨‍🍳 Chef', flower: '🌼 Flower', headphones: '🎧 Headphones', propeller: '🚁 Propeller', horns: '🤘 Horns', bow: '🎀 Bow',
  cone: '🚧 Cone', beanie: '🧢 Beanie', cowboy: '🤠 Cowboy',
  laurel: '🏆 Laurels', tentacles: '🦑 Tentacles', jester: '🤡 Jester cap', saucer: '🛸 Mini UFO', crystal: '🔮 Crystal ball',
  wizard: '🧙 Wizard', pirate: '🏴‍☠️ Pirate', viking: '⚔️ Viking', discoball: '🪩 Disco ball',
};
export const PET_LABELS = { none: 'None', cat: '🐈 Cat', duck: '🦆 Duck', drone: '🛸 Drone', alien: '👽 Alien', hamster: '🐹 Hamster', jelly: '🪼 Jelly', whale: '🐋 Space whale', rubberduck: '🐤 Rubber duck', robot: '🤖 Robot', ghost: '👻 Ghost', starbuddy: '⭐ Star buddy' };

function buildHat(id) {
  const g = new THREE.Group();
  const add = (geometry, color, x, y, z, extra) => {
    const m = mesh(geometry, mat(color, extra), x, y, z);
    g.add(m);
    return m;
  };
  switch (id) {
    case 'party': {
      add(new THREE.ConeGeometry(0.18, 0.42, 16), 0xff4fa3, 0, 0.2, 0);
      add(new THREE.SphereGeometry(0.07, 8, 6), 0xfff36b, 0, 0.43, 0);
      break;
    }
    case 'antenna': {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), 0xbbbbbb, 0, 0.2, 0);
      const ball = add(new THREE.SphereGeometry(0.08, 10, 8), 0xff3b5c, 0, 0.44, 0, { emissive: 0xff3b5c, emissiveIntensity: 1.2 });
      ball.userData.bob = true;
      break;
    }
    case 'crown': {
      add(new THREE.CylinderGeometry(0.22, 0.2, 0.14, 16, 1, true), 0xffcc33, 0, 0.04, 0, { metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.04, 0.12, 6), 0xffcc33, Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2, { metalness: 0.8, roughness: 0.25 });
      }
      break;
    }
    case 'halo': {
      const h = add(new THREE.TorusGeometry(0.22, 0.03, 8, 24), 0xfff2a8, 0, 0.28, 0, { emissive: 0xfff2a8, emissiveIntensity: 1.5 });
      h.rotation.x = Math.PI / 2;
      h.userData.bob = true;
      break;
    }
    case 'tophat': {
      add(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20), 0x151515, 0, 0.0, 0);
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.34, 20), 0x151515, 0, 0.17, 0);
      add(new THREE.CylinderGeometry(0.195, 0.195, 0.06, 20), 0xc0233a, 0, 0.05, 0);
      break;
    }
    case 'catears': {
      for (const s of [-1, 1]) {
        const e = add(new THREE.ConeGeometry(0.09, 0.2, 4), 0x2b2b2b, s * 0.17, 0.02, 0);
        e.rotation.z = -s * 0.35;
      }
      break;
    }
    case 'chef': {
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.2, 16), 0xffffff, 0, 0.08, 0);
      add(new THREE.SphereGeometry(0.25, 14, 10), 0xffffff, 0, 0.27, 0);
      break;
    }
    case 'flower': {
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 5), 0x3fae49, 0.05, 0.1, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.SphereGeometry(0.06, 8, 6), 0xff8fd0, 0.05 + Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08);
      }
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xffd23f, 0.05, 0.25, 0);
      break;
    }
    case 'headphones': {
      const band = add(new THREE.TorusGeometry(0.33, 0.03, 6, 20, Math.PI), 0x222222, 0, -0.22, 0);
      band.rotation.z = 0;
      for (const s of [-1, 1]) {
        const cup = add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), 0xff3b5c, s * 0.34, -0.25, 0);
        cup.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'propeller': {
      add(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x3b82f6, 0, -0.02, 0);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 5), 0x888888, 0, 0.2, 0);
      const blades = new THREE.Group();
      blades.position.y = 0.26;
      for (const c of [0xff3b5c, 0xffd23f]) {
        const b = mesh(new THREE.BoxGeometry(0.4, 0.01, 0.06), mat(c));
        blades.add(b);
        b.rotation.y = c === 0xff3b5c ? 0 : Math.PI / 2;
      }
      blades.userData.spin = true;
      g.add(blades);
      break;
    }
    case 'horns': {
      for (const s of [-1, 1]) {
        const h = add(new THREE.ConeGeometry(0.06, 0.32, 8), 0xf2ead7, s * 0.3, 0.0, 0);
        h.rotation.z = -s * 1.0;
      }
      add(new THREE.CylinderGeometry(0.3, 0.32, 0.12, 16, 1, true), 0x8a8f99, 0, -0.08, 0, { metalness: 0.7, side: THREE.DoubleSide });
      break;
    }
    case 'bow': {
      for (const s of [-1, 1]) {
        const b = add(new THREE.ConeGeometry(0.1, 0.18, 4), 0xff5fa8, s * 0.1, 0.05, 0.1);
        b.rotation.z = (s * Math.PI) / 2;
      }
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xff2f88, 0, 0.05, 0.1);
      break;
    }
    case 'cone': {
      add(new THREE.ConeGeometry(0.2, 0.45, 16), 0xff7a1a, 0, 0.2, 0);
      add(new THREE.CylinderGeometry(0.115, 0.135, 0.07, 16), 0xffffff, 0, 0.22, 0);
      add(new THREE.BoxGeometry(0.42, 0.04, 0.42), 0xff7a1a, 0, -0.01, 0);
      break;
    }
    case 'beanie': {
      add(new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x2e7d6b, 0, -0.12, 0);
      add(new THREE.SphereGeometry(0.08, 8, 6), 0xf2f2f2, 0, 0.2, 0);
      break;
    }
    // ---- unlockable hats ----
    case 'laurel': {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        if (Math.abs(Math.sin(a)) > 0.95 && Math.cos(a) > 0) continue; // a gap at the front
        const leaf = add(new THREE.SphereGeometry(0.07, 8, 6), 0xd9b23a, Math.cos(a) * 0.24, 0.04 + (i % 2) * 0.03, Math.sin(a) * 0.24, { metalness: 0.7, roughness: 0.3 });
        leaf.scale.set(0.55, 0.35, 1.2);
        leaf.rotation.y = -a;
      }
      break;
    }
    case 'tentacles': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const t = add(new THREE.ConeGeometry(0.05, 0.42, 7), 0x8f2cff, Math.cos(a) * 0.14, 0.18, Math.sin(a) * 0.14, { emissive: 0x4a0f80, emissiveIntensity: 0.7 });
        t.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        t.userData.bob = true;
      }
      break;
    }
    case 'jester': {
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16), 0xffd23f, 0, 0.02, 0);
      for (const s2 of [-1, 1]) {
        const c = add(new THREE.ConeGeometry(0.1, 0.42, 10), s2 < 0 ? 0xff2a2a : 0x2ad1ff, s2 * 0.17, 0.2, 0);
        c.rotation.z = s2 * -0.9;
        add(new THREE.SphereGeometry(0.055, 8, 6), 0xffd23f, s2 * 0.36, 0.33, 0, { metalness: 0.8, roughness: 0.2 });
      }
      break;
    }
    case 'saucer': {
      const disc = add(new THREE.SphereGeometry(0.26, 18, 8), 0x9aa4b8, 0, 0.32, 0, { metalness: 0.8, roughness: 0.25 });
      disc.scale.y = 0.28;
      disc.userData.bob = true;
      const dome = add(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x9bff6b, 0, 0.36, 0, { transparent: true, opacity: 0.6, emissive: 0x3aff6b, emissiveIntensity: 0.6 });
      dome.userData.bob = true;
      break;
    }
    case 'crystal': {
      // a glowing crystal ball on a little gold stand
      add(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 12), 0xc9a24a, 0, 0.02, 0, { metalness: 0.8, roughness: 0.3 });
      const ball = add(new THREE.SphereGeometry(0.15, 18, 14), 0xb46bff, 0, 0.2, 0, { emissive: 0x7a3cff, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 });
      ball.userData.bob = true;
      break;
    }
    case 'wizard': {
      // a tall, floppy, starry pointed hat
      add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), 0x3b2a8a, 0, 0, 0);
      add(new THREE.ConeGeometry(0.24, 0.62, 18), 0x4b36b0, 0, 0.32, 0);
      const tip = add(new THREE.ConeGeometry(0.09, 0.28, 12), 0x4b36b0, 0.1, 0.68, 0);
      tip.rotation.z = -0.9;
      add(new THREE.TorusGeometry(0.235, 0.025, 6, 20), 0xffd23f, 0, 0.05, 0).rotation.x = Math.PI / 2;
      for (const [x, y, z, r] of [[0.1, 0.26, 0.2, 0.04], [-0.12, 0.4, 0.12, 0.03], [0.04, 0.18, -0.22, 0.035]]) add(new THREE.OctahedronGeometry(r), 0xffe14f, x, y, z, { emissive: 0xffd23f, emissiveIntensity: 1.6 });
      break;
    }
    case 'pirate': {
      // a black tricorn with a skull on the front
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 3), 0x1a1a22, 0, 0.1, 0).rotation.y = Math.PI / 6;
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 3), 0x2a2a34, 0, 0.0, 0).rotation.y = Math.PI / 6;
      add(new THREE.SphereGeometry(0.06, 8, 6), 0xf0ead8, 0, 0.12, 0.3);
      for (const s2 of [-1, 1]) add(new THREE.BoxGeometry(0.17, 0.025, 0.02), 0xf0ead8, 0, 0.05, 0.31).rotation.z = s2 * 0.5;
      break;
    }
    case 'viking': {
      // an iron helmet with two big curved horns
      add(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aa4b8, 0, 0, 0, { metalness: 0.7, roughness: 0.35 });
      add(new THREE.TorusGeometry(0.3, 0.03, 6, 20), 0x6a7488, 0, 0.02, 0, { metalness: 0.7 }).rotation.x = Math.PI / 2;
      for (const s2 of [-1, 1]) {
        const horn = add(new THREE.ConeGeometry(0.07, 0.34, 8), 0xf0e6c8, s2 * 0.32, 0.17, 0);
        horn.rotation.z = -s2 * 0.75;
        add(new THREE.SphereGeometry(0.075, 8, 6), 0xf0e6c8, s2 * 0.3, 0.06, 0);
      }
      break;
    }
    case 'discoball': {
      // a mirror ball on a short stalk, turning and twinkling
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), 0x9aa4b8, 0, 0.05, 0);
      const ball = add(new THREE.IcosahedronGeometry(0.19, 1), 0xe8ecff, 0, 0.3, 0, { metalness: 0.25, roughness: 0.2, flatShading: true, emissive: 0x6a7090, emissiveIntensity: 0.9 });
      ball.userData.spin = true;
      for (let i = 0; i < 4; i++) add(new THREE.OctahedronGeometry(0.03), 0xffffff, Math.cos(i * 1.6) * 0.26, 0.3 + Math.sin(i * 2.3) * 0.1, Math.sin(i * 1.6) * 0.26, { emissive: 0xffffff, emissiveIntensity: 2 }).userData.bob = true;
      break;
    }
    case 'cowboy': {
      const brim = add(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 24), 0x8b5a2b, 0, 0, 0);
      brim.scale.z = 0.8;
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 16), 0x8b5a2b, 0, 0.12, 0);
      add(new THREE.CylinderGeometry(0.245, 0.245, 0.05, 16), 0x3b2412, 0, 0.04, 0);
      break;
    }
    default:
      break;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

function buildPet(id) {
  const g = new THREE.Group();
  const add = (geometry, color, x, y, z, extra) => {
    const m = mesh(geometry, mat(color, extra), x, y, z);
    g.add(m);
    return m;
  };
  switch (id) {
    case 'cat': {
      add(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), 0xff9a3c, 0, 0.16, 0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.12, 10, 8), 0xff9a3c, 0, 0.27, 0.18);
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.04, 0.08, 4), 0xff9a3c, s * 0.06, 0.39, 0.18);
      const tail = add(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 5), 0xff9a3c, 0, 0.3, -0.2);
      tail.rotation.x = -0.6;
      tail.userData.wag = true;
      break;
    }
    case 'duck': {
      add(new THREE.SphereGeometry(0.17, 12, 10), 0xffd93b, 0, 0.17, 0).scale.set(1, 0.85, 1.2);
      add(new THREE.SphereGeometry(0.1, 10, 8), 0xffd93b, 0, 0.34, 0.12);
      add(new THREE.ConeGeometry(0.04, 0.1, 6), 0xff8a1a, 0, 0.33, 0.24).rotation.x = Math.PI / 2;
      break;
    }
    case 'drone': {
      add(new THREE.BoxGeometry(0.22, 0.08, 0.22), 0x9aa4b8, 0, 0, 0, { metalness: 0.6, roughness: 0.3 });
      add(new THREE.SphereGeometry(0.04, 8, 6), 0x6cf0ff, 0, -0.02, 0.12, { emissive: 0x6cf0ff, emissiveIntensity: 2 });
      for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        const r = add(new THREE.BoxGeometry(0.16, 0.01, 0.03), 0x333333, x, 0.06, z);
        r.userData.spin = true;
      }
      g.userData.hover = 1.1;
      break;
    }
    case 'alien': {
      add(new THREE.SphereGeometry(0.16, 12, 10), 0x7dff6b, 0, 0.18, 0);
      add(new THREE.SphereGeometry(0.07, 10, 8), 0xffffff, 0, 0.22, 0.12);
      add(new THREE.SphereGeometry(0.035, 8, 6), 0x000000, 0, 0.22, 0.18);
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), 0x7dff6b, s * 0.07, 0.38, 0);
        add(new THREE.SphereGeometry(0.03, 6, 5), 0xff4fd8, s * 0.07, 0.47, 0, { emissive: 0xff4fd8 });
      }
      break;
    }
    case 'hamster': {
      add(new THREE.SphereGeometry(0.14, 12, 10), 0xc68a4f, 0, 0.13, 0).scale.set(1, 0.9, 1.25);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.04, 6, 5), 0xe8b48a, s * 0.08, 0.25, 0.08);
      add(new THREE.SphereGeometry(0.025, 6, 5), 0x111111, 0, 0.16, 0.18);
      break;
    }
    case 'rubberduck': {
      // a little rubber duck (like the big one in the docking bay)
      add(new THREE.SphereGeometry(0.17, 12, 10), 0xffd93b, 0, 0.17, 0).scale.set(1, 0.82, 1.2);
      add(new THREE.SphereGeometry(0.11, 10, 8), 0xffd93b, 0, 0.33, 0.12);
      add(new THREE.ConeGeometry(0.045, 0.11, 8), 0xff8a1a, 0, 0.32, 0.25).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.02, 6, 5), 0x111111, s * 0.05, 0.36, 0.21);
      break;
    }
    case 'jelly': {
      add(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xb48cff, 0, 0.1, 0, { transparent: true, opacity: 0.6, emissive: 0x7a4cff, emissiveIntensity: 0.6 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const t = add(new THREE.CylinderGeometry(0.012, 0.005, 0.3, 4), 0xd6c2ff, Math.cos(a) * 0.1, -0.05, Math.sin(a) * 0.1, { transparent: true, opacity: 0.7 });
        t.userData.wag = true;
      }
      g.userData.hover = 0.9;
      break;
    }
    case 'robot': {
      // a tiny wheeled robot with a bleeping antenna
      add(new THREE.BoxGeometry(0.2, 0.16, 0.18), 0x9aa4b8, 0, 0.17, 0, { metalness: 0.6, roughness: 0.3 });
      add(new THREE.BoxGeometry(0.15, 0.12, 0.14), 0xc4ccdc, 0, 0.3, 0, { metalness: 0.6, roughness: 0.3 });
      for (const s2 of [-1, 1]) {
        add(new THREE.SphereGeometry(0.028, 8, 6), 0x6cf0ff, s2 * 0.04, 0.31, 0.07, { emissive: 0x6cf0ff, emissiveIntensity: 2 });
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), 0x2b2f3a, s2 * 0.12, 0.05, 0).rotation.z = Math.PI / 2;
      }
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), 0x9aa4b8, 0, 0.42, 0);
      add(new THREE.SphereGeometry(0.025, 6, 5), 0xff3b5c, 0, 0.49, 0, { emissive: 0xff3b5c, emissiveIntensity: 2 }).userData.wag = true;
      break;
    }
    case 'ghost': {
      // a friendly floating ghost
      const body = add(new THREE.SphereGeometry(0.17, 14, 10), 0xf4f6ff, 0, 0.2, 0, { transparent: true, opacity: 0.85, emissive: 0x9aa4ff, emissiveIntensity: 0.35 });
      body.scale.set(1, 1.15, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const w = add(new THREE.ConeGeometry(0.05, 0.12, 6), 0xf4f6ff, Math.cos(a) * 0.1, 0.04, Math.sin(a) * 0.1, { transparent: true, opacity: 0.85 });
        w.rotation.x = Math.PI;
        w.userData.wag = true;
      }
      for (const s2 of [-1, 1]) add(new THREE.SphereGeometry(0.025, 6, 5), 0x14141c, s2 * 0.06, 0.25, 0.15);
      add(new THREE.SphereGeometry(0.03, 8, 6), 0x14141c, 0, 0.17, 0.16).scale.set(1, 1.3, 0.6);
      g.userData.hover = 0.9;
      break;
    }
    case 'starbuddy': {
      // one of Star Bonanza's chubby star buddies: a golden star with a big grin
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        const r = i % 2 ? 0.1 : 0.2;
        i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geom = new THREE.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.04, bevelSegments: 2 });
      geom.center();
      const body = add(geom, 0xffd23f, 0, 0.26, 0, { emissive: 0xff9a1a, emissiveIntensity: 0.35, roughness: 0.4 });
      body.userData.wag = true;
      for (const s2 of [-1, 1]) {
        add(new THREE.SphereGeometry(0.03, 8, 6), 0xffffff, s2 * 0.05, 0.3, 0.1);
        add(new THREE.SphereGeometry(0.015, 6, 5), 0x14141c, s2 * 0.05, 0.3, 0.13);
      }
      add(new THREE.TorusGeometry(0.04, 0.01, 5, 10, Math.PI), 0x7a2a1a, 0, 0.23, 0.11, undefined).rotation.z = Math.PI;
      g.userData.hover = 0.7;
      break;
    }
    case 'whale': {
      const body = add(new THREE.SphereGeometry(0.2, 14, 10), 0x4f7bd6, 0, 0.1, 0);
      body.scale.set(0.9, 0.75, 1.5);
      add(new THREE.SphereGeometry(0.15, 12, 8), 0xdfe8ff, 0, 0.03, 0.06).scale.set(0.8, 0.5, 1.3);
      for (const s2 of [-1, 1]) add(new THREE.SphereGeometry(0.025, 6, 5), 0x111111, s2 * 0.13, 0.15, 0.2);
      const tail = add(new THREE.ConeGeometry(0.12, 0.2, 4), 0x4f7bd6, 0, 0.12, -0.36);
      tail.rotation.x = -Math.PI / 2;
      tail.scale.set(1.6, 1, 0.3);
      tail.userData.wag = true;
      const spout = add(new THREE.SphereGeometry(0.04, 6, 5), 0x9fdcff, 0, 0.32, 0.05, { transparent: true, opacity: 0.7 });
      spout.userData.wag = true;
      g.userData.hover = 1;
      break;
    }
    default:
      return null;
  }
  return g;
}

// Merge a group's direct child meshes that share a material into one mesh each.
function mergeChildren(group, canMerge) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!canMerge(child) || !child.geometry.index) continue;
    child.updateMatrix();
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(child);
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    let vertices = 0;
    let indices = 0;
    for (const mesh of meshes) {
      vertices += mesh.geometry.attributes.position.count;
      indices += mesh.geometry.index.count;
    }
    const pos = new Float32Array(vertices * 3);
    const nor = new Float32Array(vertices * 3);
    const idx = new Uint32Array(indices);
    let vo = 0;
    let io = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
      vo += g.attributes.position.count;
      io += src.length;
      g.dispose();
      group.remove(mesh);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.computeBoundingSphere();
    group.add(new THREE.Mesh(geometry, material));
  }
}

// ---------------------------------------------------------------------------
// The avatar
// ---------------------------------------------------------------------------

export class Avatar {
  constructor({ look, name, suits, visors }) {
    this.suits = suits;
    this.visors = visors;
    this.root = new THREE.Group(); // at the feet; moved around the ship
    this.body = new THREE.Group(); // animated (bob, emotes)
    this.root.add(this.body);
    this.materials = [];
    this.emoteState = null;
    this.deathState = null;
    this.ghost = false;
    this.particles = [];
    this.walkPhase = Math.random() * 10;
    this.moving = false;
    this.pet = null;
    this.target = null; // remote players: where we're heading
    this.extras = new THREE.Group();
    this.root.add(this.extras);
    this.pops = []; // comic words floating up ("BEEP BOOP!", "FLEX!")
    this.squash = 0; // landing squash: springs back to nothing
    this.sleeping = false;
    this.shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: softTexture, color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
    this.floorGlow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ map: softTexture, color: 0xff5ab4, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = 0.04;
    this.floorGlow.renderOrder = -1;
    this.floorGlow.visible = false;
    this.root.add(this.floorGlow);
    this.buildSuit();
    this.setLook(look);
    this.setName(name);
  }

  buildSuit() {
    this.suitMat = mat(0xffffff);
    this.darkMat = mat(0xffffff);
    this.trimMat = mat(0xd8dde8, { roughness: 0.45 });
    this.metalMat = mat(0x8c96aa, { metalness: 0.75, roughness: 0.3 });
    this.bootMat = mat(0x2b2f3a, { roughness: 0.7 });
    // the glass bubble helmet, tinted with the visor colour
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.26, emissive: 0x000000, depthWrite: false });
    this.visorMat.userData.wasTransparent = true;
    this.headMat = mat(0x151a36, { roughness: 0.8 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xe6fbff, emissive: 0xaff0ff, emissiveIntensity: 3.2 });
    this.glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    this.glintMat.userData.wasTransparent = true;
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xfff3c4, emissiveIntensity: 2 });
    this.buttonMats = [0xff3b5c, 0xffc23b, 0x5bff8f].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 }));
    this.suitMaterials = [this.suitMat, this.darkMat, this.trimMat, this.metalMat, this.bootMat, this.visorMat, this.headMat, this.eyeMat, this.glintMat, this.lampMat, ...this.buttonMats];
    this.materials = [...this.suitMaterials];

    // everything is built at full size, then shrunk a touch so the crew fits the rooms
    this.scaler = new THREE.Group();
    this.scaler.scale.setScalar(SUIT_SCALE);
    this.root.add(this.scaler);
    this.root.remove(this.body);
    this.scaler.add(this.body);
    const b = this.body;

    // legs (pivot at the hip): short and stubby, with a bright cuff and a round boot
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.16, 0.5, 0);
      g.add(mesh(geo.leg, this.darkMat, 0, -0.17, 0));
      const cuff = mesh(geo.cuff, this.trimMat, 0, -0.29, 0);
      cuff.rotation.x = Math.PI / 2;
      g.add(cuff);
      const boot = mesh(geo.boot, this.bootMat, 0, -0.39, 0.05);
      boot.scale.set(1, 0.72, 1.4);
      g.add(boot);
      b.add(g);
      return g;
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    // body
    this.torso = mesh(geo.torso, this.suitMat, 0, 0.82, 0);
    this.torso.scale.set(1.12, 1, 0.92);
    b.add(this.torso);
    const belt = mesh(geo.belt, this.metalMat, 0, 0.56, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.1, 0.95, 1);
    b.add(belt);
    b.add(mesh(geo.panel, this.bootMat, 0, 0.86, 0.255));
    this.buttons = this.buttonMats.map((m, i) => {
      const btn = mesh(geo.button, m, -0.07 + i * 0.07, 0.86, 0.285);
      b.add(btn);
      return btn;
    });
    for (const side of [-1, 1]) {
      const pad = mesh(geo.pad, this.trimMat, side * 0.34, 1.05, 0);
      pad.scale.set(1, 0.72, 1);
      b.add(pad);
    }

    // arms (pivot at the shoulder) with big round gloves
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.38, 1.0, 0);
      g.add(mesh(geo.arm, this.suitMat, 0, -0.17, 0));
      const cuff = mesh(geo.cuff, this.trimMat, 0, -0.3, 0);
      cuff.scale.setScalar(0.85);
      cuff.rotation.x = Math.PI / 2;
      g.add(cuff);
      g.add(mesh(geo.glove, this.trimMat, 0, -0.4, 0));
      b.add(g);
      return g;
    };
    this.armL = arm(-1);
    this.armR = arm(1);

    // oxygen tanks on the back
    b.add(mesh(geo.packBox, this.darkMat, 0, 0.9, -0.29));
    for (const side of [-1, 1]) {
      b.add(mesh(geo.tank, this.metalMat, side * 0.13, 0.9, -0.4));
      b.add(mesh(geo.tankCap, this.metalMat, side * 0.13, 1.12, -0.4));
    }

    // neck ring, head and glowing eyes inside a big glass bubble helmet
    const neck = mesh(geo.neck, this.metalMat, 0, 1.1, 0);
    neck.rotation.x = Math.PI / 2;
    b.add(neck);
    b.add(mesh(geo.head, this.headMat, 0, 1.52, 0.02));
    this.eyes = [-1, 1].map((side) => {
      const e = mesh(geo.eye, this.eyeMat, side * 0.14, 1.55, 0.355);
      e.scale.set(1, 1.4, 0.6);
      b.add(e);
      return e;
    });
    this.visor = mesh(geo.helmet, this.visorMat, 0, 1.5, 0);
    this.visor.renderOrder = 2;
    b.add(this.visor);
    // a white shine on the glass sells the "bubble helmet" look
    const glint = mesh(geo.glint, this.glintMat, -0.2, 1.76, 0.3);
    glint.scale.set(1.4, 0.55, 0.3);
    glint.rotation.z = 0.55;
    glint.renderOrder = 3;
    b.add(glint);
    // a band over the top of the helmet, from pod to pod, in the suit colour
    b.add(mesh(geo.ridge, this.suitMat, 0, 1.5, 0));
    // headset pods on both sides of the helmet: a round silhouette with "ears"
    for (const side of [-1, 1]) {
      const pod = mesh(geo.pod, this.metalMat, side * 0.49, 1.5, 0);
      pod.rotation.z = Math.PI / 2;
      b.add(pod);
      const disc = mesh(new THREE.CircleGeometry(0.075, 14), this.trimMat, side * 0.545, 1.5, 0);
      disc.rotation.y = side * Math.PI / 2;
      b.add(disc);
    }
    const lamp = mesh(geo.lamp, this.metalMat, 0.25, 1.9, 0.2);
    lamp.rotation.x = Math.PI / 2 - 0.5;
    b.add(lamp);
    b.add(mesh(new THREE.CircleGeometry(0.042, 10), this.lampMat, 0.25, 1.925, 0.255));
    b.add(mesh(geo.antenna, this.metalMat, -0.22, 1.92, -0.08));
    this.antennaTip = mesh(geo.tip, this.buttonMats[0], -0.22, 2.06, -0.08);
    b.add(this.antennaTip);

    this.hatAnchor = new THREE.Group();
    this.hatAnchor.position.y = 1.92;
    this.hatAnchor.scale.setScalar(HAT_SCALE);
    b.add(this.hatAnchor);
    this.blinkAt = 1 + Math.random() * 4;

    // Performance: merge the parts that never move on their own (same look = one mesh).
    const moving = new Set([this.legL, this.legR, this.armL, this.armR, this.visor, this.antennaTip, this.hatAnchor, ...this.eyes, ...this.buttons]);
    mergeChildren(b, (o) => !moving.has(o) && o.isMesh && o.material !== this.glintMat);
    // the cartoon outline: one dark shell for the still parts and one for each limb
    outlineGroup(b, OUTLINE, moving);
    for (const limb of [this.legL, this.legR, this.armL, this.armR]) outlineGroup(limb, OUTLINE);
  }

  setLook(look) {
    this.look = look;
    const suit = new THREE.Color(this.suits[look.suit] || '#cccccc');
    this.suitMat.color.copy(suit);
    this.darkMat.color.copy(suit).multiplyScalar(0.72);
    const visor = new THREE.Color(this.visors[look.visor] || '#f2b84b');
    this.visorMat.color.copy(visor);
    this.visorMat.emissive.copy(visor).multiplyScalar(0.18);
    for (const old of [...this.hatAnchor.children]) disposeTree(old);
    const hat = buildHat(look.hat);
    outlineEach(hat, 0.012);
    this.hatAnchor.add(hat);
    if (this.pet) disposeTree(this.pet);
    this.pet = buildPet(look.pet);
    if (this.pet) outlineEach(this.pet, 0.016);
    // the ghost effect fades every material, so keep the list in step with the outfit
    this.materials = [...this.suitMaterials];
    hat.traverse((o) => o.isMesh && !o.userData.isOutline && this.materials.push(o.material));
    if (this.pet) {
      this.pet.traverse((o) => o.isMesh && !o.userData.isOutline && this.materials.push(o.material));
      this.pet.position.copy(this.root.position);
      this.root.parent?.add(this.pet);
    }
    if (this.ghost) this.setGhost(true);
  }

  addedTo(scene) {
    scene.add(this.root);
    if (this.pet) scene.add(this.pet);
  }

  dispose() {
    this.clearExtras();
    if (this.label) disposeTree(this.label);
    if (this.bubble) disposeTree(this.bubble);
    this.root.removeFromParent();
    this.pet?.removeFromParent();
  }

  // Remove death effects and particles (and free their memory).
  clearExtras() {
    for (const o of [...this.extras.children]) disposeTree(o);
    this.particles = [];
  }

  setName(name, color = '#ffffff') {
    if (this.label) disposeTree(this.label);
    this.name = name;
    this.label = makeTextSprite(name, { color, size: 34, scale: 0.0115 });
    this.label.position.y = 2.4; // above the tallest hat
    this.root.add(this.label);
  }

  say(text) {
    if (this.bubble) disposeTree(this.bubble);
    this.bubble = makeTextSprite(text, { color: '#14102a', bg: 'rgba(245,242,255,0.95)', size: 34, maxWidth: 440, scale: 0.0108 });
    this.bubble.position.y = 2.85 + this.bubble.scale.y / 2;
    this.bubble.userData.until = performance.now() + 5500;
    this.root.add(this.bubble);
  }

  setVisible(v) {
    this.root.visible = v;
    if (this.pet) this.pet.visible = v && !this.ghost;
  }

  setGhost(on) {
    this.ghost = on;
    for (const m of this.materials) {
      m.transparent = on || m.userData.wasTransparent || false;
      if (on && m.userData.baseOpacity == null) m.userData.baseOpacity = m.opacity;
      m.opacity = on ? 0.32 : m.userData.baseOpacity ?? 1;
      m.depthWrite = !on && !m.userData.wasTransparent;
      m.needsUpdate = true;
    }
    this.legL.visible = this.legR.visible = !on;
    setOutlinesVisible(this.body, !on); // a ghost is see-through: no line round it
    if (this.pet) this.pet.visible = !on && this.root.visible;
    if (this.label) this.label.material.opacity = on ? 0.55 : 1;
  }

  // ---------- animation ----------

  // take away whatever the last emote left behind (a disco ball, the floor glow, flickering visor lights)
  endEmote() {
    for (const o of [...this.extras.children]) if (o.userData.emoteProp) disposeTree(o);
    this.floorGlow.visible = false;
    this.sleeping = false;
    this.visorMat.emissiveIntensity = 1;
    this.visorMat.emissive.setHex(0x000000);
  }

  // A comic word pops up over the head and floats away.
  pop(text, color = '#ffe14f', size = 46) {
    while (this.pops.length >= 2) disposeTree(this.pops.shift().sprite);
    const sprite = makeTextSprite(text, { color, size, scale: 0.0105 });
    sprite.position.set(0, 2.9, 0);
    this.root.add(sprite);
    this.pops.push({ sprite, base: sprite.scale.clone(), t: 0, life: 1.6, sway: Math.random() * 6 });
  }

  emote(name) {
    this.endEmote();
    this.emoteState = { name, t: 0, dur: EMOTE_SECONDS[name] || 2, next: 0 };
    if (name === 'disco') {
      const ball = mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0xe8ecff, { metalness: 0.25, roughness: 0.2, flatShading: true, emissive: 0x6a7090, emissiveIntensity: 0.9 }), 0, 3.0, 0);
      ball.userData.discoBall = true;
      ball.userData.emoteProp = true;
      this.extras.add(ball);
      this.pop('DISCO!', '#ff7ad9');
    }
    if (name === 'robot') this.pop('BEEP BOOP', '#7dffd8');
    if (name === 'floss') this.pop('FLOSS!', '#7ad8ff');
    if (name === 'breakdance') this.pop('BREAK!', '#ffb347');
    if (name === 'twist') this.pop('TWIST!', '#c9a0ff');
    if (name === 'cheer') {
      this.burst(34, null, 3.5, 1.8);
      this.pop('YAY!', '#ffe14f');
    }
    if (name === 'flex') this.pop('FLEX!', '#ff8a5c');
    if (name === 'facepalm') this.pop('UGH...', '#b8c4e8');
    if (name === 'salute') this.pop('SIR!', '#a8e6ff');
    if (name === 'gasp') this.pop('!', '#ff6b81', 70);
    if (name === 'sleep') this.sleeping = true;
    if (name === 'confetti') this.burst(40, null, 3);
    if (name === 'cry') this.burst(14, 0x6cc8ff, 1);
    if (name === 'scuba') [0, 700, 1400, 2100].forEach((ms) => setTimeout(() => this.burst(6, 0xbfefff, 0.6, 1.9), ms)); // bubbles
    if (name === 'sneeze') setTimeout(() => this.burst(18, 0x9be36b, 2), 500);
    if (name === 'chicken') this.burst(10, 0xffffff, 1);
    if (name === 'zap') this.burst(16, 0x9fdcff, 3);
  }

  burst(count, color, speed = 2, y = 1, heart = false) {
    for (let i = 0; i < count; i++) {
      const c = color ?? new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
      const p = mesh(heart ? heartGeometry : geo.particle, new THREE.MeshBasicMaterial({ color: c, transparent: true }), 0, y, 0);
      if (heart) p.rotation.y = Math.random() * 6;
      p.userData.v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed + 1, (Math.random() - 0.5) * speed);
      p.userData.life = 1.4 + Math.random();
      this.extras.add(p);
      this.particles.push(p);
    }
  }

  die(anim, onDone) {
    this.endEmote();
    this.emoteState = null;
    this.deathState = { anim, t: 0, dur: anim === 'confetti' ? 1.5 : 3.2, onDone, home: this.root.position.clone() };
    const extras = this.extras;
    if (anim === 'confetti') this.burst(70, null, 4);
    if (anim === 'consumed') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = mesh(new THREE.ConeGeometry(0.09, 1.6, 6), mat(0x7a2cc7, { emissive: 0x4a0f80, emissiveIntensity: 0.8 }), Math.cos(a) * 0.55, -1, Math.sin(a) * 0.55);
        t.rotation.z = Math.cos(a) * 0.35;
        t.rotation.x = -Math.sin(a) * 0.35;
        t.userData.tentacle = true;
        extras.add(t);
      }
    }
    if (anim === 'abducted') {
      const beam = mesh(new THREE.ConeGeometry(1.2, 8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9bff6b, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }), 0, 4, 0);
      beam.userData.beam = true;
      extras.add(beam);
      const ufo = mesh(new THREE.SphereGeometry(1, 20, 8), mat(0x9aa4b8, { metalness: 0.8, roughness: 0.2 }), 0, 8.2, 0);
      ufo.scale.set(1.6, 0.35, 1.6);
      extras.add(ufo);
    }
    if (anim === 'frozen') {
      const ice = mesh(geo.box, new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3 }), 0, 0.85, 0);
      ice.scale.set(1.3, 1.9, 1.1);
      ice.userData.ice = true;
      extras.add(ice);
    }
    if (anim === 'duck') {
      this.body.visible = false;
      const duck = new THREE.Group();
      const yellow = mat(0xffd93b);
      duck.add(mesh(new THREE.SphereGeometry(0.6, 16, 12), yellow, 0, 0.5, 0));
      duck.children[0].scale.set(1, 0.8, 1.25);
      duck.add(mesh(new THREE.SphereGeometry(0.36, 14, 10), yellow, 0, 1.1, 0.4));
      const beak = mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat(0xff8a1a), 0, 1.05, 0.82);
      beak.rotation.x = Math.PI / 2;
      duck.add(beak);
      for (const s of [-1, 1]) duck.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0x000000), s * 0.15, 1.2, 0.7));
      duck.userData.duck = true;
      extras.add(duck);
      this.burst(20, 0xffd93b, 2);
    }
    if (anim === 'rocket') {
      const flame = mesh(new THREE.ConeGeometry(0.28, 1.1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), 0, -0.3, -0.35);
      flame.rotation.x = Math.PI;
      flame.userData.flame = true;
      extras.add(flame);
    }
    if (anim === 'disco') {
      const ball = mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(0xe8ecff, { metalness: 0.25, roughness: 0.2, flatShading: true, emissive: 0x6a7090, emissiveIntensity: 0.9 }), 0, 3.4, 0);
      ball.userData.discoBall = true;
      extras.add(ball);
    }
    if (anim === 'shot') {
      this.burst(24, 0xff7a3a, 3);
      this.burst(10, 0xffffff, 4);
    }
  }

  update(dt, time) {
    const b = this.body;
    // reset per-frame pose
    b.position.set(0, 0, 0);
    b.rotation.order = 'XYZ';
    b.rotation.set(0, 0, 0);
    let s = 1;
    let squashNow = 0; // squash and stretch this frame (positive squashes, negative stretches)
    // arms rest slightly away from the body so they're visible (out = negative z on the left, positive on the right)
    this.armL.rotation.set(0, 0, -0.22);
    this.armR.rotation.set(0, 0, 0.22);
    this.armL.scale.set(1, 1, 1);
    this.armR.scale.set(1, 1, 1);

    // walking: a low-gravity "moon lope" like the Apollo astronauts. Slow,
    // bounding hops that hang at the top, a lean into each stride, arms held
    // out for balance, and a puff of dust on every landing.
    const walking = this.moving && !this.ghost;
    this.walkBlend = (this.walkBlend || 0) + ((walking ? 1 : 0) - (this.walkBlend || 0)) * Math.min(1, dt * 6);
    const w = this.walkBlend;
    if (walking) this.walkPhase += dt * 6.2; // about two hops a second: slower than an Earth walk
    if (w > 0.01) {
      const ph = this.walkPhase;
      const s = Math.sin(ph);
      const hop = Math.pow(Math.abs(s), 0.6); // flat-topped arc: floaty at the top, quick landing
      b.position.y = hop * 0.24 * w;
      squashNow -= hop * 0.05 * w; // stretch a little at the top of each hop
      b.rotation.x = 0.14 * w; // lean forward into the stride
      b.rotation.z = Math.sin(ph * 0.5) * 0.05 * w; // gentle side-to-side rock
      // legs reach forward and back, both tucking a little while airborne
      this.legL.rotation.x = (s * 0.5 - hop * 0.18) * w;
      this.legR.rotation.x = (-s * 0.5 - hop * 0.18) * w;
      // arms held out from the sides for balance (rising a little on each hop), swinging against the legs.
      // (+z turns an arm towards +x, so the left arm goes out with a negative angle and the right with a positive one)
      this.armL.rotation.z = -0.22 - (0.85 + hop * 0.25) * w;
      this.armR.rotation.z = 0.22 + (0.85 + hop * 0.25) * w;
      this.armL.rotation.x = -s * 0.55 * w;
      this.armR.rotation.x = s * 0.55 * w;
      // touchdown: once per hop, when the sine changes sign
      const landed = walking && Math.sign(s) !== Math.sign(this.lastStride || s);
      this.lastStride = s;
      if (landed) {
        this.stepped = true;
        this.squash = Math.max(this.squash, 0.11); // squash on touchdown
        if (this.root.visible) this.burst(3, 0x9aa4b8, 0.5, 0.06); // moon dust
      }
    }
    if (!walking) {
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      b.position.y = Math.max(b.position.y, 0) + Math.sin(time * 2 + this.walkPhase) * 0.015 * (1 - w);
      squashNow -= Math.sin(time * 2.2 + this.walkPhase) * 0.012 * (1 - w); // breathing
    }
    if (this.ghost) {
      b.position.y = 0.35 + Math.sin(time * 1.7 + this.walkPhase) * 0.12;
      b.rotation.z = Math.sin(time * 1.1 + this.walkPhase) * 0.06;
    }

    // emotes
    const e = this.emoteState;
    if (e) {
      e.t += dt;
      const p = Math.min(1, e.t / e.dur);
      const wave = Math.sin(e.t * 12);
      // everyone dancing in the ship moves to the same beat (two a second), so a crowd looks like a crowd
      const half = Math.sin(time * Math.PI * 2); // one sway a second
      const bounce = Math.abs(half); // a bounce on every beat
      const easeIn = Math.min(1, e.t / 0.25, (e.dur - e.t) / 0.25); // for poses that drop in and climb out
      switch (e.name) {
        case 'wave': this.armR.rotation.z = -2.6 + wave * 0.35; break;
        case 'dance': b.rotation.y = Math.sin(e.t * 6) * 0.6; b.position.y += Math.abs(Math.sin(e.t * 8)) * 0.25; this.armL.rotation.z = 2 + wave * 0.4; this.armR.rotation.z = -2 - wave * 0.4; break;
        case 'jump': {
          // crouch, launch (stretching), hang, land (squashing)
          if (e.t < 0.16) squashNow += (e.t / 0.16) * 0.22;
          else {
            const air = Math.min(1, (e.t - 0.16) / 0.8);
            b.position.y += Math.sin(Math.PI * air) * 1.3;
            squashNow -= Math.sin(Math.PI * air) * 0.1;
            this.armL.rotation.z = -1.4 - Math.sin(Math.PI * air) * 0.8;
            this.armR.rotation.z = 1.4 + Math.sin(Math.PI * air) * 0.8;
            if (air >= 1 && !e.landed) {
              e.landed = true;
              this.squash = 0.24;
              this.burst(6, 0x9aa4b8, 0.8, 0.06);
            }
          }
          break;
        }
        case 'spin': b.rotation.y = p * Math.PI * 4; break;
        case 'shrug': this.armL.rotation.z = 1.2; this.armR.rotation.z = -1.2; b.scale.y = 1; break;
        case 'point': this.armR.rotation.x = -1.6; break;
        case 'cry': b.rotation.x = 0.25; b.position.x = Math.sin(e.t * 30) * 0.02; break;
        case 'laugh': b.rotation.x = Math.sin(e.t * 25) * 0.12; b.position.y += Math.abs(Math.sin(e.t * 25)) * 0.05; break;
        case 'faint': b.rotation.x = -Math.min(1, e.t * 3) * (p < 0.85 ? 1.5 : 1.5 * (1 - (p - 0.85) / 0.15)); this.dizzy(time); break;
        case 'shiver': b.position.x = (Math.random() - 0.5) * 0.12; b.position.z = (Math.random() - 0.5) * 0.12; break;
        case 'flail': this.armL.rotation.z = Math.sin(e.t * 20) * 2.5; this.armR.rotation.z = Math.cos(e.t * 22) * 2.5; b.position.y += Math.abs(Math.sin(e.t * 10)) * 0.2; break;
        case 'grow': s = 1 + Math.sin(Math.PI * p) * 0.9; break;
        case 'shrink': s = 1 - Math.sin(Math.PI * p) * 0.6; break;
        case 'scooby': {
          // Scooby Doo Pa Pa: both arms swing out to one side, then the other, knees bouncing on the beat
          const beat = Math.sin(e.t * 8.5);
          b.position.x = beat * 0.14;
          b.rotation.z = -beat * 0.14;
          b.rotation.y = beat * 0.25;
          b.position.y += Math.abs(Math.cos(e.t * 8.5)) * 0.14;
          this.armL.rotation.z = -1.15 + beat * 0.95; // both arms out to the sides, swinging together
          this.armR.rotation.z = 1.15 + beat * 0.95;
          this.armL.rotation.x = -0.3;
          this.armR.rotation.x = -0.3;
          this.legL.rotation.x = Math.max(0, beat) * 0.55;
          this.legR.rotation.x = Math.max(0, -beat) * 0.55;
          break;
        }
        case 'scuba': {
          // the scuba dance: pinch your nose, wave the other arm overhead and shimmy down into the deep, then back up
          const dip = Math.sin(Math.PI * p);
          const wiggle = Math.sin(e.t * 14);
          b.position.y -= dip * 0.45;
          b.position.x = wiggle * 0.06;
          b.rotation.z = wiggle * 0.1;
          this.armR.rotation.z = -2.2; // hand up to the helmet
          this.armR.rotation.x = -1.2;
          this.armL.rotation.z = 2.7 + Math.sin(e.t * 9) * 0.35; // other arm up, waving like a swimmer
          this.legL.rotation.x = dip * 0.8;
          this.legR.rotation.x = dip * 0.8;
          break;
        }
        case 'chicken': b.rotation.x = Math.sin(e.t * 14) * 0.35; this.armL.rotation.z = 0.8 + wave * 0.5; this.armR.rotation.z = -0.8 - wave * 0.5; break;
        case 'sneeze': b.rotation.x = e.t < 0.5 ? -e.t * 0.8 : Math.max(0, 0.6 - (e.t - 0.5) * 1.5); break;
        case 'moonwalk': {
          const back = Math.sin(Math.PI * p) * 1.8;
          b.position.z = -back;
          this.legL.rotation.x = Math.sin(e.t * 10) * 0.5;
          this.legR.rotation.x = -Math.sin(e.t * 10) * 0.5;
          break;
        }
        case 'levitate': b.position.y += Math.sin(Math.PI * p) * 1.8; b.rotation.y = p * Math.PI * 2; this.armL.rotation.z = 1.4; this.armR.rotation.z = -1.4; break;
        case 'zap': b.position.x = (Math.random() - 0.5) * 0.15; this.visorMat.emissiveIntensity = 3 * (1 - p); break;

        // ---- the dances (all on the shared beat) ----
        case 'floss': {
          // hips one way, straight arms swinging across the other way, knees bouncing
          b.position.x = -half * 0.2;
          b.rotation.z = half * 0.1;
          b.rotation.y = -half * 0.2;
          b.position.y += bounce * 0.07;
          this.armL.rotation.set(0.55, 0, half * 0.95);
          this.armR.rotation.set(0.55, 0, half * 0.95);
          this.legL.rotation.x = bounce * 0.25;
          this.legR.rotation.x = bounce * 0.25;
          break;
        }
        case 'robot': {
          // snaps between stiff poses four times a second, like a stuck animation
          const POSES = [
            [[0, -1.57], [0, 1.57], 0], [[-1.57, -0.3], [-1.57, 0.3], 0.7], [[-1.57, -2.9], [0, 0.22], 0.7], [[0, -0.22], [-1.57, 2.9], -0.7],
            [[-1.2, -1.3], [-1.2, 1.3], -0.7], [[0, -2.9], [0, 2.9], 0], [[-1.57, -1.57], [0, 0.22], 0.7], [[0, -0.22], [-1.57, 1.57], -0.7],
          ];
          const step = Math.floor(time * 4) % POSES.length;
          const [l, r, yaw] = POSES[step];
          this.armL.rotation.set(l[0], 0, l[1]);
          this.armR.rotation.set(r[0], 0, r[1]);
          b.rotation.y = yaw;
          this.visorMat.emissive.setHex(step % 2 ? 0x3affb0 : 0xff3b5c);
          this.visorMat.emissiveIntensity = 1.4;
          if (step !== e.lastStep) {
            e.lastStep = step;
            if (step % 4 === 0) this.burst(4, 0x9fdcff, 1.2, 1.3);
          }
          break;
        }
        case 'disco': {
          // Saturday Night Fever: one arm points to the sky while the other points at the floor, then they swap
          this.armR.rotation.set(-0.25, 0, 1.8 + half * 0.95);
          this.armL.rotation.set(-0.25, 0, -1.8 + half * 0.95);
          b.rotation.z = -half * 0.12;
          b.rotation.y = half * 0.3;
          b.position.y += bounce * 0.08;
          this.legL.rotation.x = Math.max(0, half) * -0.4;
          this.legR.rotation.x = Math.max(0, -half) * -0.4;
          for (const o of this.extras.children) if (o.userData.discoBall) o.rotation.y = e.t * 4;
          break;
        }
        case 'breakdance': {
          // down on the back and spinning like a windmill, legs kicking
          const spin = e.t * 7;
          const down = easeIn;
          b.rotation.order = 'YXZ';
          b.rotation.set(-1.45 * down, spin, 0);
          b.position.set(0.95 * Math.sin(spin) * down, 0.3 * down, 0.95 * Math.cos(spin) * down);
          this.legL.rotation.x = -1.2 + Math.sin(e.t * 9) * 0.9 * down;
          this.legR.rotation.x = -1.2 - Math.sin(e.t * 9) * 0.9 * down;
          this.armL.rotation.z = -1.3 * down - 0.22;
          this.armR.rotation.z = 1.3 * down + 0.22;
          break;
        }
        case 'twist': {
          // low and fast: knees bent, hips whipping round, arms swinging the other way
          const tw = Math.sin(time * Math.PI * 4);
          b.rotation.y = tw * 0.75;
          b.rotation.x = 0.12;
          b.position.y -= 0.1;
          this.armL.rotation.set(-0.5, 0, -0.8 + tw * 0.55);
          this.armR.rotation.set(-0.5, 0, 0.8 + tw * 0.55);
          this.legL.rotation.x = -0.25;
          this.legR.rotation.x = -0.25;
          squashNow += 0.05;
          break;
        }

        // ---- the reactions ----
        case 'cheer': {
          const pump = Math.abs(Math.sin(e.t * 9));
          b.position.y += pump * 0.3;
          squashNow -= pump * 0.06;
          this.armL.rotation.z = -2.7 - pump * 0.25;
          this.armR.rotation.z = 2.7 + pump * 0.25;
          this.legL.rotation.x = -pump * 0.3;
          this.legR.rotation.x = pump * 0.3;
          break;
        }
        case 'clap': {
          // hands out in front, meeting in the middle with a spark each time
          const c = Math.abs(Math.sin(e.t * 11));
          this.armL.rotation.set(-1.25, 0, -0.5 + c * 1.2);
          this.armR.rotation.set(-1.25, 0, 0.5 - c * 1.2);
          b.rotation.x = 0.05;
          if (c > 0.93 && !e.hit) {
            e.hit = true;
            this.burst(2, 0xffe14f, 0.8, 1.0);
          } else if (c < 0.6) e.hit = false;
          break;
        }
        case 'bow': {
          const lean = p < 0.25 ? p / 0.25 : p < 0.7 ? 1 : (1 - p) / 0.3;
          const k = lean * lean * (3 - 2 * lean);
          b.rotation.x = k * 1.0;
          this.armR.rotation.set(-1.3 * k, 0, -0.22 - 0.9 * k); // a hand across the chest
          this.armL.rotation.z = -0.22 - 0.6 * k;
          if (p > 0.72 && !e.sparkled) {
            e.sparkled = true;
            this.burst(14, 0xffe14f, 2.5, 1.6);
          }
          break;
        }
        case 'flex': {
          const f = Math.sin(e.t * 6);
          this.armL.rotation.set(-0.4, 0, -1.25 - Math.max(0, f) * 0.45);
          this.armR.rotation.set(-0.4, 0, 1.25 + Math.max(0, -f) * 0.45);
          this.armL.scale.set(1.5, 1.1, 1.5);
          this.armR.scale.set(1.5, 1.1, 1.5);
          s = 1 + 0.06 * Math.abs(f);
          this.legL.rotation.z = -0.12;
          this.legR.rotation.z = 0.12;
          if (e.t > e.next) {
            e.next = e.t + 0.55;
            this.burst(5, 0xffe14f, 1.6, 1.7);
          }
          break;
        }
        case 'facepalm': {
          const shake = Math.sin(e.t * 6) * 0.16 * (1 - p);
          // (a longer arm than usual: these stubby suits cannot otherwise reach their own faces)
          this.armR.rotation.set(0.8, 0, -2.65);
          this.armR.scale.set(1, 1.3, 1);
          b.rotation.x = 0.22;
          b.rotation.y = shake;
          break;
        }
        case 'salute': {
          const snap = Math.min(1, e.t / 0.12) * Math.min(1, (e.dur - e.t) / 0.15);
          this.armR.rotation.set(0.55 * snap, 0, -0.22 - 2.63 * snap);
          this.armR.scale.set(1, 1 + 0.3 * snap, 1);
          b.rotation.x = -0.05 * snap;
          this.legL.rotation.z = 0.08 * snap;
          this.legR.rotation.z = -0.08 * snap;
          break;
        }
        case 'heart': {
          // arms curved over the head, the whole suit beating, hearts floating up
          const beat = Math.max(0, Math.sin(e.t * 9));
          this.armL.rotation.z = 2.85;
          this.armR.rotation.z = -2.85;
          s = 1 + beat * 0.06;
          b.rotation.z = Math.sin(e.t * 3) * 0.05;
          if (e.t > e.next) {
            e.next = e.t + 0.32;
            this.burst(1, 0xff5a8a, 1, 1.9, true);
          }
          break;
        }
        case 'sleep': {
          b.rotation.x = 0.32 + Math.sin(time * 1.5) * 0.05;
          b.position.y -= 0.04;
          this.armL.rotation.z = -0.1;
          this.armR.rotation.z = 0.1;
          if (e.t > e.next) {
            e.next = e.t + 1.0;
            this.pop('Z', '#9ad8ff', 44 + Math.floor(Math.random() * 14));
          }
          break;
        }
        case 'gasp': {
          const air = Math.sin(Math.PI * Math.min(1, e.t / 0.5));
          b.position.y += air * 0.3;
          b.position.z = -0.22 * Math.min(1, e.t * 5) * (1 - p);
          b.rotation.x = -0.12 * air;
          this.armL.rotation.z = -2.2 * Math.min(1, e.t * 6);
          this.armR.rotation.z = 2.2 * Math.min(1, e.t * 6);
          break;
        }
        default: break;
      }
      // dancers get a spotlight on the floor that pulses on the beat and drifts through the colours
      if (DANCE_EMOTES.has(e.name)) {
        this.floorGlow.visible = true;
        this.floorGlow.material.color.setHSL((time * 0.35) % 1, 0.9, 0.55);
        this.floorGlow.material.opacity = 0.3 + bounce * 0.3;
        this.floorGlow.scale.setScalar(0.9 + bounce * 0.2);
      }
      if (p >= 1) {
        this.emoteState = null;
        this.endEmote();
      }
    }

    // death animation
    const d = this.deathState;
    if (d) {
      d.t += dt;
      const p = Math.min(1, d.t / d.dur);
      let ownScale = false;
      switch (d.anim) {
        case 'airlock': b.position.set(p * p * 14, p * 3, -p * p * 6); b.rotation.set(p * 9, p * 7, 0); s = 1 - p * 0.7; break;
        case 'consumed': b.position.y = -p * 1.8; b.rotation.y = p * 3; this.extras.children.forEach((t) => t.userData.tentacle && (t.position.y = -1 + Math.sin(Math.PI * p) * 1.6)); break;
        case 'spaghettified': b.scale.set(1 - p * 0.9, 1 + p * 5, 1 - p * 0.9); ownScale = true; b.position.y = p > 0.6 ? (p - 0.6) * 40 : 0; break;
        case 'abducted': b.position.y = p * 7.5; b.rotation.y = p * 8; break;
        case 'melted': b.scale.set(1 + p * 0.8, Math.max(0.06, 1 - p), 1 + p * 0.8); ownScale = true; this.suitMat.color.multiplyScalar(0.995); break;
        case 'confetti': s = Math.max(0.001, 1 - p * 3); break;
        case 'frozen': this.suitMat.color.lerp(new THREE.Color(0x9fdcff), 0.05); if (p > 0.8 && !d.shattered) { d.shattered = true; this.burst(30, 0xbfefff, 3); this.extras.children.forEach((o) => o.userData.ice && (o.visible = false)); } break;
        case 'duck': this.extras.children.forEach((o) => o.userData.duck && (o.rotation.y = Math.sin(d.t * 3) * 0.4)); break;
        case 'floataway': b.position.y = p * 6; this.armR.rotation.z = -2.6 + Math.sin(d.t * 10) * 0.4; s = 1 - p * 0.3; break;
        case 'fainted': b.rotation.x = -Math.min(1, d.t * 3) * 1.5; this.dizzy(time); break;
        case 'shot': b.rotation.x = -Math.min(1, d.t * 4) * 1.5; b.position.z = -Math.min(1, d.t * 4) * 0.8; break;
        case 'balloon': {
          // puff up, float, then POP
          b.scale.set(1 + p * 1.4, 1 + p * 0.9, 1 + p * 1.4);
          ownScale = true;
          b.position.y = p * p * 3;
          if (p > 0.92 && !d.popped) {
            d.popped = true;
            this.burst(40, this.suitMat.color.getHex(), 4, 2);
            this.body.visible = false;
          }
          break;
        }
        case 'disco': {
          b.rotation.y = d.t * 9;
          b.position.y = Math.abs(Math.sin(d.t * 10)) * 0.4;
          this.suitMat.color.setHSL((d.t * 2) % 1, 0.9, 0.55);
          this.extras.children.forEach((o) => o.userData.discoBall && (o.rotation.y = d.t * 4));
          if (p > 0.9 && !d.popped) {
            d.popped = true;
            this.burst(50, null, 3);
          }
          s = p > 0.9 ? Math.max(0.001, 1 - (p - 0.9) * 10) : 1;
          break;
        }
        case 'tiny': s = Math.max(0.03, 1 - p * 1.05); b.position.x = Math.sin(d.t * 18) * 0.15 * p; break;
        case 'rocket': {
          const lift = Math.max(0, p - 0.25) / 0.75;
          b.position.y = lift * lift * 16;
          b.position.x = Math.sin(d.t * 30) * (p < 0.25 ? 0.06 : 0);
          this.extras.children.forEach((o) => {
            if (!o.userData.flame) return;
            o.position.y = b.position.y - 0.3;
            o.scale.setScalar(0.6 + Math.random() * 0.6);
          });
          break;
        }
        default: b.rotation.x = -Math.min(1, d.t * 3) * 1.5; break;
      }
      if (!ownScale) b.scale.setScalar(s);
      if (p >= 1) {
        const done = d.onDone;
        this.deathState = null;
        this.clearExtras();
        this.body.visible = true;
        b.scale.setScalar(1);
        this.setGhost(true);
        done?.();
      }
    } else {
      this.squash *= Math.exp(-dt * 9);
      const q = this.squash + squashNow;
      b.scale.set(s * (1 + q * 0.7), s * (1 - q), s * (1 + q * 0.7));
    }

    // the soft shadow follows the feet: smaller and fainter the higher they leave the floor
    const lift = Math.max(0, b.position.y);
    const k = 1 / (1 + lift * 0.8);
    this.shadow.visible = !this.ghost && b.visible && !this.deathState;
    this.shadow.scale.set(k, k, 1);
    this.shadow.material.opacity = 0.4 * k;

    // comic words floating up
    for (const w of this.pops) {
      w.t += dt;
      const grow = Math.min(1, w.t / 0.18);
      w.sprite.scale.copy(w.base).multiplyScalar(grow < 1 ? 1.4 * Math.sin((grow * Math.PI) / 2) : 1.4 - 0.4 * Math.min(1, (w.t - 0.18) / 0.15));
      w.sprite.position.set(Math.sin(w.t * 3 + w.sway) * 0.1, 2.9 + w.t * 0.55, 0);
      w.sprite.material.opacity = Math.min(1, (1 - w.t / w.life) * 3);
    }
    this.pops = this.pops.filter((w) => {
      if (w.t < w.life) return true;
      disposeTree(w.sprite);
      return false;
    });

    // blinking eyes, chest buttons and antenna light
    this.blinkAt -= dt;
    const closed = this.blinkAt < 0 || this.sleeping;
    if (this.blinkAt < -0.13) this.blinkAt = 2 + Math.random() * 5;
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : 1.4;
    this.buttons.forEach((btn, i) => (btn.visible = Math.sin(time * (2 + i) + this.walkPhase + i) > -0.3));
    this.antennaTip.visible = Math.sin(time * 3 + this.walkPhase) > 0;

    // hats & pets
    this.hatAnchor.traverse((o) => {
      if (o.userData.bob) o.position.y = (o.userData.y0 ??= o.position.y) + Math.sin(time * 3) * 0.03;
      if (o.userData.spin) o.rotation.y += dt * 18;
    });
    if (this.pet) {
      _forward.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      _side.set(_forward.z, 0, -_forward.x);
      _want.copy(this.root.position).addScaledVector(_forward, -0.8).addScaledVector(_side, 0.55);
      this.pet.position.lerp(_want, Math.min(1, dt * 4));
      this.pet.position.y = (this.pet.userData.hover || 0) + Math.sin(time * 4 + this.walkPhase) * (this.pet.userData.hover ? 0.1 : 0.02);
      const lx = this.root.position.x - this.pet.position.x;
      const lz = this.root.position.z - this.pet.position.z;
      if (lx * lx + lz * lz > 0.01) this.pet.rotation.y = Math.atan2(lx, lz);
      this.pet.traverse((o) => {
        if (o.userData.spin) o.rotation.y += dt * 30;
        if (o.userData.wag) o.rotation.z = Math.sin(time * 8) * 0.4;
      });
    }

    // particles
    for (const p of this.particles) {
      p.userData.life -= dt;
      p.userData.v.y -= dt * 4;
      p.position.addScaledVector(p.userData.v, dt);
      p.material.opacity = Math.max(0, p.userData.life);
      if (p.userData.life <= 0) disposeTree(p);
    }
    this.particles = this.particles.filter((p) => p.userData.life > 0);

    // speech bubble fade
    if (this.bubble && performance.now() > this.bubble.userData.until) {
      this.bubble.material.opacity -= dt * 2;
      if (this.bubble.material.opacity <= 0) {
        disposeTree(this.bubble);
        this.bubble = null;
      }
    }
  }

  dizzy(time) {
    if (!this.stars) {
      this.stars = new THREE.Group();
      for (let i = 0; i < 4; i++) this.stars.add(mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffe14f })));
      this.stars.position.y = 1.9;
      this.root.add(this.stars);
      setTimeout(() => {
        if (this.stars) disposeTree(this.stars);
        this.stars = null;
      }, 3500);
    }
    this.stars.children.forEach((st, i) => {
      const a = time * 4 + (i / 4) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.45, Math.sin(time * 6 + i) * 0.05, Math.sin(a) * 0.45);
    });
  }
}
