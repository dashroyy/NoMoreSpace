// Astronaut avatars, built from simple shapes. Everyone wears the same suit
// shape (so nobody can tell roles apart); colours, hats and pets are cosmetic.
import * as THREE from 'three';

// Shared shapes for the spacesuit (a chunky astronaut with a glass bubble helmet).
const geo = {
  torso: new THREE.CapsuleGeometry(0.29, 0.28, 6, 16),
  leg: new THREE.CapsuleGeometry(0.11, 0.26, 4, 10),
  boot: new THREE.BoxGeometry(0.21, 0.13, 0.3),
  arm: new THREE.CapsuleGeometry(0.085, 0.3, 4, 8),
  glove: new THREE.SphereGeometry(0.095, 10, 8),
  pad: new THREE.SphereGeometry(0.12, 12, 8),
  belt: new THREE.TorusGeometry(0.31, 0.04, 6, 24),
  neck: new THREE.TorusGeometry(0.2, 0.05, 8, 24),
  helmet: new THREE.SphereGeometry(0.34, 28, 20),
  head: new THREE.SphereGeometry(0.25, 16, 12),
  eye: new THREE.SphereGeometry(0.058, 10, 8),
  glint: new THREE.SphereGeometry(0.07, 10, 6),
  ridge: new THREE.TorusGeometry(0.345, 0.025, 6, 24, Math.PI),
  panel: new THREE.BoxGeometry(0.24, 0.16, 0.05),
  button: new THREE.SphereGeometry(0.022, 6, 5),
  tank: new THREE.CylinderGeometry(0.1, 0.1, 0.5, 14),
  tankCap: new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  packBox: new THREE.BoxGeometry(0.34, 0.32, 0.12),
  lamp: new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10),
  antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5),
  tip: new THREE.SphereGeometry(0.035, 8, 6),
  particle: new THREE.SphereGeometry(0.06, 6, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const SUIT_SCALE = 0.88;
const SHARED_GEOMETRY = new Set(Object.values(geo));

// Free the graphics memory used by throwaway objects (speech bubbles,
// particles, death effects). Shared suit shapes are kept.
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !SHARED_GEOMETRY.has(o.geometry)) o.geometry.dispose();
    for (const m of [o.material].flat()) {
      if (!m) continue;
      m.map?.dispose();
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
  ctx.font = `${size}px VT323, ui-monospace, monospace`;
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
    lines.forEach((l, i) => ctx.strokeText(l, width / 2, padding + i * size * 1.25));
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
  }
  lines.forEach((l, i) => ctx.fillText(l, width / 2, padding + i * size * 1.25));
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
  laurel: '🏆 Laurels', tentacles: '🦑 Tentacles', jester: '🤡 Jester cap', saucer: '🛸 Mini UFO',
};
export const PET_LABELS = { none: 'None', cat: '🐈 Cat', duck: '🦆 Duck', drone: '🛸 Drone', alien: '👽 Alien', hamster: '🐹 Hamster', jelly: '🪼 Jelly', whale: '🐋 Space whale' };

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
    this.headMat = mat(0x0b0d18, { roughness: 0.9 });
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

    // legs (pivot at the hip) with chunky boots
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.15, 0.55, 0);
      g.add(mesh(geo.leg, this.darkMat, 0, -0.22, 0));
      g.add(mesh(geo.boot, this.bootMat, 0, -0.48, 0.04));
      b.add(g);
      return g;
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    // body
    this.torso = mesh(geo.torso, this.suitMat, 0, 0.92, 0);
    this.torso.scale.set(1.12, 1, 0.9);
    b.add(this.torso);
    const belt = mesh(geo.belt, this.metalMat, 0, 0.66, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.1, 0.95, 1);
    b.add(belt);
    b.add(mesh(geo.panel, this.bootMat, 0, 0.98, 0.26));
    this.buttons = this.buttonMats.map((m, i) => {
      const btn = mesh(geo.button, m, -0.065 + i * 0.065, 0.98, 0.29);
      b.add(btn);
      return btn;
    });
    for (const side of [-1, 1]) {
      const pad = mesh(geo.pad, this.trimMat, side * 0.33, 1.2, 0);
      pad.scale.set(1, 0.7, 1);
      b.add(pad);
    }

    // arms (pivot at the shoulder) with gloves
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.37, 1.17, 0);
      g.add(mesh(geo.arm, this.suitMat, 0, -0.22, 0));
      g.add(mesh(geo.glove, this.trimMat, 0, -0.45, 0));
      b.add(g);
      return g;
    };
    this.armL = arm(-1);
    this.armR = arm(1);

    // oxygen tanks on the back
    b.add(mesh(geo.packBox, this.darkMat, 0, 1.0, -0.28));
    for (const side of [-1, 1]) {
      b.add(mesh(geo.tank, this.metalMat, side * 0.12, 0.98, -0.36));
      b.add(mesh(geo.tankCap, this.metalMat, side * 0.12, 1.23, -0.36));
    }

    // neck ring, head and glowing eyes inside a glass bubble helmet
    const neck = mesh(geo.neck, this.metalMat, 0, 1.36, 0);
    neck.rotation.x = Math.PI / 2;
    b.add(neck);
    b.add(mesh(geo.head, this.headMat, 0, 1.6, 0.02));
    this.eyes = [-1, 1].map((side) => {
      const e = mesh(geo.eye, this.eyeMat, side * 0.09, 1.66, 0.2);
      e.scale.set(1, 1.25, 0.7);
      b.add(e);
      return e;
    });
    this.visor = mesh(geo.helmet, this.visorMat, 0, 1.62, 0);
    this.visor.renderOrder = 2;
    b.add(this.visor);
    // a white shine on the glass sells the "bubble helmet" look
    const glint = mesh(geo.glint, this.glintMat, -0.14, 1.8, 0.24);
    glint.scale.set(1.3, 0.55, 0.3);
    glint.rotation.z = 0.5;
    glint.renderOrder = 3;
    b.add(glint);
    const ridge = mesh(geo.ridge, this.suitMat, 0, 1.62, 0);
    ridge.rotation.y = Math.PI / 2;
    b.add(ridge);
    const lamp = mesh(geo.lamp, this.metalMat, 0.27, 1.76, 0.1);
    lamp.rotation.x = Math.PI / 2;
    b.add(lamp);
    b.add(mesh(new THREE.CircleGeometry(0.04, 10), this.lampMat, 0.27, 1.76, 0.155));
    b.add(mesh(geo.antenna, this.metalMat, -0.22, 1.9, -0.06));
    this.antennaTip = mesh(geo.tip, this.buttonMats[0], -0.22, 2.03, -0.06);
    b.add(this.antennaTip);

    this.hatAnchor = new THREE.Group();
    this.hatAnchor.position.y = 1.93;
    b.add(this.hatAnchor);
    this.blinkAt = 1 + Math.random() * 4;

    // Performance: merge the parts that never move on their own (same look = one mesh).
    const moving = new Set([this.legL, this.legR, this.armL, this.armR, this.visor, this.antennaTip, this.hatAnchor, ...this.eyes, ...this.buttons]);
    mergeChildren(b, (o) => !moving.has(o) && o.isMesh && o.material !== this.glintMat);
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
    this.hatAnchor.add(hat);
    if (this.pet) disposeTree(this.pet);
    this.pet = buildPet(look.pet);
    // the ghost effect fades every material, so keep the list in step with the outfit
    this.materials = [...this.suitMaterials];
    hat.traverse((o) => o.isMesh && this.materials.push(o.material));
    if (this.pet) {
      this.pet.traverse((o) => o.isMesh && this.materials.push(o.material));
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
    this.label.position.y = 2.25;
    this.root.add(this.label);
  }

  say(text) {
    if (this.bubble) disposeTree(this.bubble);
    this.bubble = makeTextSprite(text, { color: '#14102a', bg: 'rgba(245,242,255,0.95)', size: 34, maxWidth: 440, scale: 0.0108 });
    this.bubble.position.y = 2.7 + this.bubble.scale.y / 2;
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
    if (this.pet) this.pet.visible = !on && this.root.visible;
    if (this.label) this.label.material.opacity = on ? 0.55 : 1;
  }

  // ---------- animation ----------

  emote(name) {
    this.emoteState = { name, t: 0, dur: { faint: 3.5, levitate: 3, moonwalk: 2.6, grow: 2.5, shrink: 2.5, dance: 3, chicken: 2.6, scooby: 3.4, scuba: 3.6 }[name] || 2 };
    if (name === 'confetti') this.burst(40, null, 3);
    if (name === 'cry') this.burst(14, 0x6cc8ff, 1);
    if (name === 'scuba') [0, 700, 1400, 2100].forEach((ms) => setTimeout(() => this.burst(6, 0xbfefff, 0.6, 1.9), ms)); // bubbles
    if (name === 'sneeze') setTimeout(() => this.burst(18, 0x9be36b, 2), 500);
    if (name === 'chicken') this.burst(10, 0xffffff, 1);
    if (name === 'zap') this.burst(16, 0x9fdcff, 3);
  }

  burst(count, color, speed = 2, y = 1) {
    for (let i = 0; i < count; i++) {
      const c = color ?? new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
      const p = mesh(geo.particle, new THREE.MeshBasicMaterial({ color: c, transparent: true }), 0, y, 0);
      p.userData.v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed + 1, (Math.random() - 0.5) * speed);
      p.userData.life = 1.4 + Math.random();
      this.extras.add(p);
      this.particles.push(p);
    }
  }

  die(anim, onDone) {
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
      const ball = mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(0xdddddd, { metalness: 1, roughness: 0.15, flatShading: true }), 0, 3.4, 0);
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
    b.rotation.set(0, 0, 0);
    let s = 1;
    // arms rest slightly away from the body so they're visible (out = negative z on the left, positive on the right)
    this.armL.rotation.set(0, 0, -0.22);
    this.armR.rotation.set(0, 0, 0.22);

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
        if (this.root.visible) this.burst(3, 0x9aa4b8, 0.5, 0.06); // moon dust
      }
    }
    if (!walking) {
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      b.position.y = Math.max(b.position.y, 0) + Math.sin(time * 2 + this.walkPhase) * 0.015 * (1 - w);
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
      switch (e.name) {
        case 'wave': this.armR.rotation.z = -2.6 + wave * 0.35; break;
        case 'dance': b.rotation.y = Math.sin(e.t * 6) * 0.6; b.position.y += Math.abs(Math.sin(e.t * 8)) * 0.25; this.armL.rotation.z = 2 + wave * 0.4; this.armR.rotation.z = -2 - wave * 0.4; break;
        case 'jump': b.position.y += Math.sin(Math.PI * Math.min(1, e.t / 0.8)) * 1.3; break;
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
        default: break;
      }
      if (p >= 1) {
        this.emoteState = null;
        this.visorMat.emissiveIntensity = 1;
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
      b.scale.setScalar(s);
    }

    // blinking eyes, chest buttons and antenna light
    this.blinkAt -= dt;
    const closed = this.blinkAt < 0;
    if (this.blinkAt < -0.13) this.blinkAt = 2 + Math.random() * 5;
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : 1.25;
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
      this.stars.position.y = 1.7;
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
