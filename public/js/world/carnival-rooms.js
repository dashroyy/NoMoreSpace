// 🎪 The Cosmic Carnival's rooms. While a ship plays that script, every room is
// dressed like part of a circus (the space-station props are hidden, see
// ship.setTheme): a Ferris wheel on the Observation Deck, a carousel in
// Navigation, a steam calliope in Comms, a clown clinic, a snack stand, a Tesla
// coil and a strongman's bell in the Spark Tent, two cannons in the Cannon Bay,
// a topiary garden, the human cannon where the airlock was, caravans and a clown
// car, and a prop room with giant dice and a magician's cabinet.
//
// Everything is made of simple shapes and canvas patterns (no image files). Pieces
// that never move are merged into a few meshes per material; the wheel, carousel,
// calliope, Tesla coil, high striker and cannons are animated. Purely for looks:
// nothing here blocks anyone.
import * as THREE from 'three';
import { ROOMS, CORRIDORS, roomOutline, chamferOf } from './layout.js';
import { makeTextSprite } from './avatar.js';

const RED = 0xd7263d;
const GOLD = 0xffd23f;
const CREAM = 0xf6f3ea;
const PINK = 0xee6fb6;
const TEAL = 0x38d6e8;
const PURPLE = 0x7b3fe4;
const GREEN = 0x7fe33b;
const ORANGE = 0xf08a24;
const BLUE = 0x3b6df0;
const PALETTE = [RED, GOLD, TEAL, PURPLE, PINK, GREEN, ORANGE];

const css = (c) => `#${c.toString(16).padStart(6, '0')}`;

// ---------- materials and patterns (shared, so merged meshes stay few) ----------
const materials = new Map();
function M(color, { e = 0, o = 1, r = 0.6 } = {}) {
  const key = `${color}|${e}|${o}|${r}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: r, metalness: 0.05, emissive: e ? color : 0x000000, emissiveIntensity: e, transparent: o < 1, opacity: o, depthWrite: o >= 1,
    }));
  }
  return materials.get(key);
}

const canvases = new Map();
// a 128px tile: 'checker' (2x2), 'stripes' (two vertical halves), 'diag' (diagonal bands), 'dots' (polka dots on c1)
function patternCanvas(kind, c1, c2) {
  const key = `${kind}|${c1}|${c2}`;
  if (canvases.has(key)) return canvases.get(key);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = css(c1);
  g.fillRect(0, 0, S, S);
  g.fillStyle = css(c2);
  if (kind === 'checker') {
    g.fillRect(0, 0, S / 2, S / 2);
    g.fillRect(S / 2, S / 2, S / 2, S / 2);
  } else if (kind === 'stripes') {
    g.fillRect(S / 2, 0, S / 2, S);
  } else if (kind === 'diag') {
    for (const poly of [[[0, 0], [S / 2, 0], [0, S / 2]], [[S, 0], [S, S / 2], [S / 2, S], [0, S]]]) {
      g.beginPath();
      poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
    }
  } else if (kind === 'dots') {
    for (const [x, y] of [[S / 4, S / 4], [(3 * S) / 4, (3 * S) / 4]]) {
      g.beginPath();
      g.arc(x, y, S * 0.16, 0, Math.PI * 2);
      g.fill();
    }
  }
  canvases.set(key, c);
  return c;
}
const textured = new Map();
function T(kind, c1, c2, rx = 1, ry = 1, extra = {}) {
  const key = `${kind}|${c1}|${c2}|${rx}|${ry}|${JSON.stringify(extra)}`;
  if (!textured.has(key)) {
    const tex = new THREE.CanvasTexture(patternCanvas(kind, c1, c2));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(rx, ry);
    textured.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.03, ...extra }));
  }
  return textured.get(key);
}

// dice faces and the magician's starry cabinet door
function drawnMaterial(key, draw) {
  if (!textured.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    textured.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  }
  return textured.get(key);
}
const diceMat = () => drawnMaterial('dice', (g) => {
  g.fillStyle = '#fbf7ee';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1a1020';
  for (const [x, y] of [[32, 32], [96, 32], [32, 64], [96, 64], [32, 96], [96, 96]]) {
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  }
});
const cabinetMat = () => drawnMaterial('cabinet', (g) => {
  g.fillStyle = '#4a1f9a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffd23f';
  g.font = '34px serif';
  g.textAlign = 'center';
  for (const [x, y, s] of [[34, 36, '★'], [92, 54, '✦'], [44, 92, '✦'], [96, 106, '★']]) g.fillText(s, x, y);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
});

function add(group, geometry, material, x = 0, y = 0, z = 0, rot = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

const cyl = (r1, r2, h, seg = 14) => new THREE.CylinderGeometry(r1, r2, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const halfCyl = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg, 1, false, 0, Math.PI);
const ball = (r, seg = 14) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4));
const tor = (r, t, seg = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, seg, arc);

// ---------- little reusable pieces ----------
function balloonAt(g, x, y, z, color, r = 0.34) {
  add(g, ball(r, 12), M(color, { e: 0.25, r: 0.25 }), x, y, z, null, [1, 1.2, 1]);
}

const PENNANT = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.7, -0.2, 0)]);
PENNANT.computeVertexNormals();
const flagMats = new Map();
const flagMat = (c) => {
  if (!flagMats.has(c)) flagMats.set(c, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  return flagMats.get(c);
};

function stripedPole(g, x, z, height, c1 = RED, c2 = CREAM, flag = GOLD) {
  add(g, cyl(0.17, 0.2, height, 12), T('stripes', c1, c2, 6, Math.max(2, Math.round(height * 1.4))), x, height / 2, z);
  add(g, ball(0.22, 10), M(GOLD, { e: 0.5 }), x, height + 0.12, z);
  add(g, PENNANT, flagMat(flag), x, height + 0.7, z);
}

// a horse for the carousel, facing +x
function horse(color) {
  const h = new THREE.Group();
  const body = M(color, { r: 0.4 });
  add(h, new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), body, 0, 0, 0, [0, 0, Math.PI / 2]);
  add(h, new THREE.CapsuleGeometry(0.11, 0.35, 4, 8), body, 0.4, 0.28, 0, [0, 0, -0.6]);
  add(h, box(0.3, 0.2, 0.16), body, 0.62, 0.5, 0);
  add(h, new THREE.ConeGeometry(0.05, 0.14, 4), M(CREAM), 0.58, 0.64, 0.05);
  add(h, new THREE.ConeGeometry(0.05, 0.14, 4), M(CREAM), 0.58, 0.64, -0.05);
  add(h, box(0.34, 0.06, 0.34), M(GOLD, { e: 0.3 }), 0, 0.22, 0);
  add(h, new THREE.ConeGeometry(0.1, 0.45, 6), M(CREAM), -0.45, -0.05, 0, [0, 0, 1.9]);
  for (const [x, z] of [[0.28, 0.1], [0.28, -0.1], [-0.28, 0.1], [-0.28, -0.1]]) add(h, cyl(0.045, 0.04, 0.42, 6), body, x, -0.3, z);
  return h;
}

function circusCannon(g, color = RED) {
  const barrel = new THREE.Group();
  add(barrel, cyl(0.7, 0.85, 3.4, 18), T('stripes', color, GOLD, 4, 3), 0, 0, 0);
  add(barrel, tor(0.78, 0.1, 18), M(GOLD, { e: 0.4 }), 0, 1.7, 0, [Math.PI / 2, 0, 0]);
  add(barrel, tor(0.88, 0.1, 18), M(GOLD, { e: 0.4 }), 0, -1.5, 0, [Math.PI / 2, 0, 0]);
  add(barrel, new THREE.CircleGeometry(0.62, 16), M(0x120a1c), 0, 1.71, 0, [-Math.PI / 2, 0, 0]);
  barrel.rotation.x = -1.0; // pitched up toward the north
  barrel.position.set(0, 1.5, 0);
  g.add(barrel);
  for (const s of [-1, 1]) {
    add(g, tor(0.85, 0.12, 20), M(0x6b3b1a), s * 1.05, 0.9, 0.2, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 4; i++) add(g, box(0.08, 1.7, 0.08), M(0x6b3b1a), s * 1.05, 0.9, 0.2, [(i * Math.PI) / 4, 0, 0]);
  }
  add(g, cyl(0.1, 0.1, 2.2, 8), M(0x4a4a58), 0, 0.9, 0.2, [0, 0, Math.PI / 2]);
  for (const [x, z] of [[1.5, 1.4], [1.9, 1.7], [1.3, 1.9]]) add(g, ball(0.22, 10), M(0x2a2a36), x, 0.22, z);
  return barrel;
}

// where a cannon's mouth is (world position) and which way it points
function muzzle(barrel) {
  barrel.updateWorldMatrix(true, false);
  const p = barrel.localToWorld(new THREE.Vector3(0, 1.75, 0));
  const d = new THREE.Vector3(0, 1, 0).transformDirection(barrel.matrixWorld);
  return { p, d };
}

// ---------- one confetti pool shared by the cannons ----------
class Burst {
  constructor(parent) {
    this.n = 120;
    this.pos = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.v = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.pos.fill(-999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.cursor = 0;
  }

  fire(x, y, z, dx, dy, dz, count = 48) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor++ % this.n;
      const s = 4 + Math.random() * 5;
      this.pos.set([x, y, z], i * 3);
      this.v.set([dx * s + (Math.random() - 0.5) * 3, dy * s + (Math.random() - 0.5) * 3, dz * s + (Math.random() - 0.5) * 3], i * 3);
      const c = new THREE.Color(PALETTE[(Math.random() * PALETTE.length) | 0]);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 1.4 + Math.random() * 0.8;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 7 * dt;
      this.v[i * 3] *= 1 - 0.8 * dt;
      this.v[i * 3 + 2] *= 1 - 0.8 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.v[i * 3 + a] * dt;
      if (this.life[i] <= 0 || this.pos[i * 3 + 1] < 0) {
        this.life[i] = 0;
        this.pos.set([-999, -999, -999], i * 3);
      }
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// merge every mesh under `root` that shares a material into one mesh (fewer draw calls)
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (o.isMesh && !Array.isArray(o.material)) {
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(o);
    }
  });
  const merged = new THREE.Group();
  for (const [material, meshes] of buckets) {
    const parts = meshes.map((mesh) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld));
    const count = parts.reduce((n, p) => n + p.attributes.position.count, 0);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    let at = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, at * 3);
      if (p.attributes.normal) nor.set(p.attributes.normal.array, at * 3);
      if (p.attributes.uv) uv.set(p.attributes.uv.array, at * 2);
      at += p.attributes.position.count;
      p.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    merged.add(new THREE.Mesh(geo, material));
  }
  return merged;
}

// room floors: a bright tent-floor pattern over the metal deck
const FLOORS = {
  observation: ['diag', PURPLE, GOLD], navigation: ['checker', RED, CREAM], comms: ['checker', TEAL, GOLD], medbay: ['dots', CREAM, PINK],
  galley: ['checker', RED, CREAM], reactor: ['diag', GOLD, PURPLE], engine: ['stripes', RED, GOLD], hydroponics: ['stripes', GREEN, 0x4ea82a],
  airlock: ['diag', RED, CREAM], quarters: ['stripes', TEAL, ORANGE], cargo: ['checker', PURPLE, GOLD], bridge: null,
};
// the point light in each room takes on a circus colour
export const CARNIVAL_LIGHTS = {
  bridge: 0xff5fa8, observation: 0xffd23f, navigation: 0xff4f5f, comms: 0x38d6e8, medbay: 0xff8ac8, galley: 0xffa63f,
  reactor: 0xffe14f, engine: 0xff5a3a, hydroponics: 0x7fe33b, airlock: 0xff2f4f, quarters: 0xb06bff, cargo: 0xffc23f,
};

export class CarnivalRooms {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.lowFx = lowFx;
    this.anims = []; // (t, dt) functions for the pieces that move
    this.burst = new Burst(this.group);
    const still = new THREE.Group(); // static pieces, merged at the end
    this.still = still;

    this.floors(still);
    this.bunting();
    for (const room of ROOMS) {
      const [x0, z0, x1, z1] = room.rect;
      const R = { room, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
      // a spot on this room's floor, as a group that is either static (merged) or live (animated)
      R.at = (x, y, z, ry = 0, live = false) => {
        const g = new THREE.Group();
        g.position.set(R.cx + x, y, R.cz + z);
        g.rotation.y = ry;
        (live ? this.group : still).add(g);
        return g;
      };
      this.poles(R, still);
      const dress = this[`room_${room.id}`];
      if (dress) dress.call(this, R);
    }
    this.group.add(mergeStatic(still));
    still.clear();
  }

  // ---------- floors, runners, bunting, poles ----------
  floors(parent) {
    for (const room of ROOMS) {
      const spec = FLOORS[room.id];
      if (!spec) continue;
      const [kind, c1, c2] = spec;
      const shape = new THREE.Shape(roomOutline(room.rect).map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mat = T(kind, c1, c2, kind === 'dots' ? 0.5 : 0.5, 0.5, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.008;
      parent.add(mesh);
    }
    // red and cream runners down the corridors
    for (const [x0, z0, x1, z1] of CORRIDORS) {
      const w = x1 - x0;
      const d = z1 - z0;
      const mat = T('checker', RED, GOLD, w, d, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0.009, (z0 + z1) / 2);
      parent.add(mesh);
    }
  }

  // strings of triangle flags along every room's north wall (one mesh, vertex colours)
  bunting() {
    const pos = [];
    const col = [];
    const line = [];
    const c = new THREE.Color();
    for (const room of ROOMS) {
      const [x0, z0, x1] = room.rect;
      const ch = chamferOf(room.rect);
      const ax = x0 + ch + 0.3;
      const bx = x1 - ch - 0.3;
      const z = z0 + 0.6;
      const y = 2.3;
      const sag = 0.4;
      const n = Math.max(4, Math.round((bx - ax) / 0.75));
      const at = (t) => [ax + (bx - ax) * t, y - sag * 4 * t * (1 - t)];
      for (let i = 0; i < n; i++) {
        const [xa, ya] = at((i + 0.12) / n);
        const [xb, yb] = at((i + 0.88) / n);
        const [xm, ym] = at((i + 0.5) / n);
        pos.push(xa, ya, z, xb, yb, z, xm, ym - 0.42, z);
        c.setHex(PALETTE[(i + room.id.length) % PALETTE.length]);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
      for (let i = 0; i < 24; i++) {
        const [xa, ya] = at(i / 24);
        const [xb, yb] = at((i + 1) / 24);
        line.push(xa, ya, z, xb, yb, z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const flags = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.group.add(flags);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    this.group.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a2a44 })));
  }

  // striped tent poles with a gold ball and a pennant where the north walls meet
  poles(R, parent) {
    const [x0, z0, x1] = R.room.rect;
    const ch = chamferOf(R.room.rect);
    const g = new THREE.Group();
    [[x0 + 0.2, z0 + ch], [x1 - 0.2, z0 + ch], [x0 + ch, z0 + 0.2], [x1 - ch, z0 + 0.2]].forEach(([x, z], i) => stripedPole(g, x, z, 2.5, i % 2 ? RED : TEAL, CREAM, PALETTE[(i + R.room.id.length) % PALETTE.length]));
    parent.add(g);
  }

  // ---------- 🎡 Observation Deck → The Ferris Wheel ----------
  room_observation(R) {
    const wheel = R.at(-4.5, 3.9, -4.6, 0, true);
    const spin = new THREE.Group();
    wheel.add(spin);
    add(spin, tor(3.1, 0.08, 48), M(GOLD, { e: 0.6 }));
    add(spin, tor(1.5, 0.05, 32), M(RED));
    add(spin, cyl(0.34, 0.34, 0.5, 14), M(0xc9a24a, { r: 0.35 }), 0, 0, 0, [Math.PI / 2, 0, 0]);
    const gondolas = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      add(spin, box(3.1, 0.05, 0.05), M(CREAM), Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0, [0, 0, a]);
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0);
      spin.add(pivot);
      add(pivot, box(0.5, 0.5, 0.5), M(PALETTE[i % PALETTE.length], { r: 0.4 }), 0, -0.48, 0);
      add(pivot, new THREE.ConeGeometry(0.42, 0.28, 4), M(CREAM), 0, -0.12, 0, [0, Math.PI / 4, 0]);
      add(pivot, cyl(0.015, 0.015, 0.22, 4), M(0x555566), 0, -0.05, 0);
      gondolas.push(pivot);
      add(spin, ball(0.08, 6), M(GOLD, { e: 1.4 }), Math.cos(a + 0.2) * 3.1, Math.sin(a + 0.2) * 3.1, 0.1);
    }
    const legs = R.at(-4.5, 0, -4.6);
    const tilt = Math.atan2(1.9, 3.9);
    for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) add(legs, cyl(0.1, 0.13, 4.4, 8), M(0xb0343f), s * 0.95, 1.95, z, [0, 0, s * tilt]);
    this.anims.push((t, dt) => {
      spin.rotation.z += dt * 0.2;
      for (const p of gondolas) p.rotation.z = -spin.rotation.z;
    });
    // striped benches and a ticket booth
    const s = R.at(0, 0, 0);
    for (const x of [-2, 1.2]) {
      add(s, box(2.4, 0.4, 0.8), T('stripes', RED, CREAM, 5, 1), x, 0.25, 3.3);
      add(s, box(2.4, 0.5, 0.12), M(RED), x, 0.7, 3.65);
    }
    add(s, box(1.8, 1.2, 1.4), M(PINK), 7, 0.6, 3);
    add(s, new THREE.ConeGeometry(1.5, 0.9, 4), T('stripes', RED, CREAM, 4, 1), 7, 1.65, 3, [0, Math.PI / 4, 0]);
    add(s, box(1.2, 0.08, 0.5), M(GOLD, { e: 0.4 }), 7, 1.05, 2.2);
  }

  // ---------- 🎠 Navigation → The Carousel ----------
  room_navigation(R) {
    const c = R.at(0, 0, 2.6, 0, true);
    const platform = new THREE.Group();
    c.add(platform);
    add(platform, cyl(2.3, 2.4, 0.3, 28), T('stripes', RED, CREAM, 8, 1), 0, 0.15, 0);
    add(platform, cyl(0.22, 0.22, 3.3, 10), M(GOLD, { e: 0.5 }), 0, 1.8, 0);
    add(platform, new THREE.ConeGeometry(2.6, 0.95, 28), T('stripes', PINK, CREAM, 10, 1), 0, 3.5, 0);
    add(platform, tor(2.5, 0.07, 32), M(GOLD, { e: 0.6 }), 0, 3.05, 0, [Math.PI / 2, 0, 0]);
    add(platform, ball(0.2, 10), M(GOLD, { e: 0.8 }), 0, 4.1, 0);
    const horses = [];
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * 1.55;
      const z = Math.sin(a) * 1.55;
      add(platform, cyl(0.03, 0.03, 2.7, 5), M(GOLD, { e: 0.5 }), x, 1.7, z);
      const h = horse(PALETTE[i % PALETTE.length]);
      h.position.set(x, 1.2, z);
      h.rotation.y = -a - Math.PI / 2;
      platform.add(h);
      horses.push({ h, base: 1.2, phase: i * 1.05 });
      add(platform, ball(0.07, 6), M(GOLD, { e: 1.5 }), Math.cos(a + 0.3) * 2.5, 3.05, Math.sin(a + 0.3) * 2.5);
    }
    this.anims.push((t, dt) => {
      platform.rotation.y += dt * 0.5;
      for (const k of horses) k.h.position.y = k.base + Math.sin(t * 1.6 + k.phase) * 0.22;
    });
    const s = R.at(0, 0, 0);
    for (const x of [-6, 6]) balloonAt(s, x, 2.2, -1.5, x < 0 ? PINK : TEAL);
  }

  // ---------- 🎹 Comms → The Calliope ----------
  room_comms(R) {
    const s = R.at(-4.5, 0, -1.2, 0.2);
    add(s, box(3.2, 1.3, 1.3), T('stripes', RED, GOLD, 8, 1), 0, 0.95, 0);
    add(s, box(3.4, 0.12, 1.5), M(GOLD, { e: 0.4 }), 0, 1.65, 0);
    for (let i = 0; i < 9; i++) {
      const h = 0.9 + ((i * 5) % 7) * 0.22;
      add(s, cyl(0.14, 0.14, h, 10), M(i % 2 ? GOLD : 0xe9c04a, { e: 0.35, r: 0.3 }), -1.4 + i * 0.35, 1.7 + h / 2, -0.35);
    }
    for (const x of [-1.9, 1.9]) {
      add(s, tor(0.55, 0.09, 20), M(0x6b3b1a), x, 0.55, 0.62, [0, 0, 0]);
      for (let k = 0; k < 4; k++) add(s, box(1.0, 0.06, 0.06), M(0x6b3b1a), x, 0.55, 0.62, [0, 0, (k * Math.PI) / 4]);
    }
    add(s, new THREE.ConeGeometry(0.65, 1.3, 14, 1, true), M(GOLD, { e: 0.5, r: 0.3 }), 2.1, 2.2, 0, [0, 0, -Math.PI / 2 - 0.2]);
    const stage = R.at(3.2, 0, 3.3);
    add(stage, cyl(2.6, 2.7, 0.35, 24), T('stripes', PURPLE, GOLD, 8, 1), 0, 0.18, 0);
    for (const x of [-1.6, 1.6]) {
      add(stage, cyl(0.04, 0.04, 2.2, 5), M(0x444455), x, 1.4, -0.4);
      add(stage, ball(0.14, 8), M(0xfff0a0, { e: 1.6 }), x, 2.5, -0.4);
    }
    // music notes drifting up
    const notes = [0, 1, 2, 3].map((i) => {
      const n = makeTextSprite(['🎵', '🎶'][i % 2], { size: 54, scale: 0.012 });
      this.group.add(n);
      return { n, phase: i * 0.75 };
    });
    this.anims.push((t) => {
      for (const { n, phase } of notes) {
        const u = ((t * 0.3 + phase) % 3) / 3;
        n.position.set(R.cx - 4.5 + u * 2.4 + Math.sin(t * 2 + phase) * 0.3, 3.4 + u * 2.2, R.cz - 1.4);
        n.material.opacity = Math.sin(u * Math.PI);
      }
    });
  }

  // ---------- 🤡 Medbay → The Clown Clinic ----------
  room_medbay(R) {
    const s = R.at(0, 0, 0);
    for (const x of [-4.5, -0.5]) {
      add(s, box(2.2, 0.5, 1.1), M(CREAM), x, 0.4, -3.6);
      add(s, box(2.1, 0.12, 1.0), T('dots', PINK, CREAM, 2, 1), x, 0.72, -3.6);
      add(s, box(0.7, 0.18, 0.9), M(0xffffff), x - 0.7, 0.88, -3.6);
    }
    // a big red cross, and a red clown nose on a stand instead of a scanner
    add(s, box(1.4, 1.4, 0.1), M(CREAM), -2.5, 3.0, -7.4);
    add(s, box(1.1, 0.34, 0.12), M(RED), -2.5, 3.0, -7.35);
    add(s, box(0.34, 1.1, 0.12), M(RED), -2.5, 3.0, -7.35);
    add(s, cyl(0.5, 0.65, 0.8, 16), M(CREAM), 4, 0.4, -3);
    add(s, ball(0.55, 18), M(RED, { e: 0.6, r: 0.25 }), 4, 1.3, -3);
    add(s, tor(0.95, 0.06, 28), M(PINK, { e: 1 }), 4, 0.9, -3, [Math.PI / 2, 0, 0]);
    // a balloon dog
    const d = R.at(-6.2, 0, 1.2, 0.5);
    const body = M(GOLD, { e: 0.2, r: 0.25 });
    add(d, new THREE.CapsuleGeometry(0.2, 0.7, 6, 12), body, 0, 0.7, 0, [0, 0, Math.PI / 2]);
    add(d, ball(0.22, 12), body, 0.75, 0.95, 0);
    add(d, new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), body, 1.0, 0.9, 0, [0, 0, -Math.PI / 2]);
    for (const x of [-0.4, -0.18]) for (const z of [-0.12, 0.12]) add(d, new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), body, x + (x < -0.3 ? 0 : 0.7), 0.35, z);
    add(d, ball(0.16, 8), body, -0.62, 0.8, 0);
    // an IV pole with a red balloon on it
    add(s, cyl(0.03, 0.03, 2.3, 6), M(0x9aa4b8), -6.8, 1.15, -3.2);
    balloonAt(s, -6.8, 2.5, -3.2, RED, 0.28);
  }

  // ---------- 🍿 Galley → The Snack Stand ----------
  room_galley(R) {
    const s = R.at(0, 0, 0);
    add(s, box(4.6, 1.0, 1.2), T('stripes', RED, CREAM, 10, 1), -3.4, 0.5, -3.7);
    add(s, box(4.8, 0.1, 1.5), M(0x6b4a2b), -3.4, 1.05, -3.7);
    // the striped awning
    add(s, box(5.0, 0.1, 1.9), T('stripes', RED, CREAM, 10, 1), -3.4, 2.35, -3.9, [0.35, 0, 0]);
    for (const x of [-5.7, -1.1]) add(s, cyl(0.05, 0.05, 2.4, 6), M(GOLD), x, 1.2, -3.0);
    // popcorn machine
    add(s, box(1.0, 0.8, 1.0), M(RED), 0.8, 0.4, -3.7);
    add(s, box(0.95, 1.1, 0.95), M(0xfff6d6, { o: 0.4 }), 0.8, 1.35, -3.7);
    add(s, new THREE.ConeGeometry(0.8, 0.5, 4), M(RED), 0.8, 2.15, -3.7, [0, Math.PI / 4, 0]);
    for (let i = 0; i < 14; i++) add(s, ball(0.1, 6), M(0xfff1b8), 0.8 + ((i * 7) % 5 - 2) * 0.14, 1.0 + (i % 4) * 0.22, -3.7 + ((i * 3) % 5 - 2) * 0.13);
    // cotton candy
    add(s, cyl(0.7, 0.6, 0.6, 18), M(0xb8bfd0, { r: 0.35 }), 3.3, 0.3, -3.7);
    const fluff = R.at(3.3, 0.95, -3.7, 0, true);
    add(fluff, ball(0.55, 12), M(PINK, { e: 0.35, r: 0.9 }), 0, 0, 0, null, [1, 0.8, 1]);
    add(fluff, ball(0.38, 10), M(0xffb3de, { e: 0.35, r: 0.9 }), 0.3, 0.3, 0.1);
    this.anims.push((t, dt) => { fluff.rotation.y += dt * 1.4; });
    // giant lollipops
    [[6.4, RED], [5.6, TEAL], [7.1, GREEN]].forEach(([x, c], i) => {
      add(s, cyl(0.04, 0.04, 1.6, 6), M(CREAM), x, 0.8, -2.2 - i * 0.7);
      add(s, cyl(0.45, 0.45, 0.08, 18), T('diag', c, CREAM, 1, 1), x, 1.75, -2.2 - i * 0.7, [Math.PI / 2, 0, 0]);
    });
    // two little tables with stools
    for (const [x, z] of [[-4.5, 3], [0, 3.4]]) {
      add(s, cyl(0.75, 0.75, 0.08, 18), M(CREAM), x, 0.85, z);
      add(s, cyl(0.07, 0.1, 0.85, 8), M(GOLD), x, 0.42, z);
      for (const a of [0, 2.1, 4.2]) add(s, cyl(0.2, 0.2, 0.5, 10), M(PINK), x + Math.cos(a) * 1.1, 0.25, z + Math.sin(a) * 1.1);
    }
  }

  // ---------- ⚡ Reactor → The Spark Tent ----------
  room_reactor(R) {
    const s = R.at(0, 0, 0);
    // two Tesla coils
    const tops = [];
    for (const x of [-5, 5]) {
      add(s, cyl(0.6, 0.75, 0.4, 14), M(PURPLE), x, 0.2, -3.6);
      add(s, cyl(0.2, 0.25, 2.4, 10), M(0x3a3a50, { r: 0.3 }), x, 1.5, -3.6);
      for (let i = 0; i < 5; i++) add(s, tor(0.85 - i * 0.12, 0.06, 20), M(GOLD, { e: 0.4, r: 0.3 }), x, 0.9 + i * 0.42, -3.6, [Math.PI / 2, 0, 0]);
      tops.push(new THREE.Vector3(R.cx + x, 3.4, R.cz - 3.6));
    }
    const topMat = M(0xcfe9ff, { e: 1.4 });
    for (const p of tops) add(this.group, ball(0.42, 14), topMat, p.x, p.y, p.z);
    const arcGeo = new THREE.BufferGeometry();
    const arcPos = new Float32Array(14 * 3);
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0xbfe9ff }));
    arc.frustumCulled = false;
    this.group.add(arc);
    let nextArc = 0;
    this.anims.push((t) => {
      if (t < nextArc) return;
      nextArc = t + 0.07;
      const on = Math.sin(t * 1.3) > -0.35;
      arc.visible = on;
      topMat.emissiveIntensity = on ? 1.4 + Math.random() * 0.9 : 0.5;
      if (!on) return;
      for (let i = 0; i < 14; i++) {
        const u = i / 13;
        const p = tops[0].clone().lerp(tops[1], u);
        const jag = i === 0 || i === 13 ? 0 : 0.35;
        arcPos.set([p.x, p.y + Math.sin(u * Math.PI) * 0.5 + (Math.random() - 0.5) * jag, p.z + (Math.random() - 0.5) * jag], i * 3);
      }
      arcGeo.attributes.position.needsUpdate = true;
    });
    // the high striker: swing the mallet, ring the bell
    add(s, box(1.4, 0.3, 1.4), M(0x6b3b1a), 6, 0.15, 3);
    add(s, cyl(0.13, 0.13, 5.2, 10), T('stripes', RED, GOLD, 2, 8), 6, 2.9, 3);
    add(s, ball(0.3, 12), M(GOLD, { e: 0.8, r: 0.25 }), 6, 5.7, 3);
    for (let i = 0; i < 6; i++) add(s, box(0.4, 0.05, 0.05), M(CREAM), 6.25, 0.9 + i * 0.75, 3);
    add(s, cyl(0.07, 0.07, 1.2, 6), M(0x6b3b1a), 4.9, 0.4, 3.9, [0, 0.4, Math.PI / 2]);
    add(s, cyl(0.2, 0.2, 0.5, 10), M(0x4a4a58), 4.4, 0.4, 3.75, [0.4, 0, 0]);
    const puck = new THREE.Mesh(ball(0.2, 10), M(RED, { e: 0.9 }));
    this.group.add(puck);
    this.anims.push((t) => {
      const u = (t % 7) / 7;
      const rise = u < 0.2 ? 1 - (1 - u / 0.2) ** 2 : u < 0.4 ? 1 : Math.max(0, 1 - (u - 0.4) / 0.35);
      puck.position.set(R.cx + 6.22, 0.7 + rise * 4.7, R.cz + 3);
    });
    // a ring of striped drums to sit on
    for (const [x, z] of [[-6, 3], [-3.5, 4.4]]) add(s, cyl(0.6, 0.6, 0.55, 16), T('stripes', PURPLE, GOLD, 6, 1), x, 0.28, z);
  }

  // ---------- 💥 Engine Room → The Cannon Bay ----------
  room_engine(R) {
    const barrels = [];
    for (const [x, ry] of [[-6.2, -0.8], [6.2, 0.8]]) {
      const g = R.at(x, 0, 2.2, ry, true);
      barrels.push({ barrel: circusCannon(g, x < 0 ? RED : BLUE), g });
      const target = R.at(x * 0.5, 0, -6.6);
      add(target, cyl(1.1, 1.1, 0.1, 24), M(CREAM), 0, 2.2, 0, [Math.PI / 2, 0, 0]);
      for (const [r, c] of [[0.85, RED], [0.55, CREAM], [0.25, RED]]) add(target, cyl(r, r, 0.12, 24), M(c), 0, 2.2, 0.01, [Math.PI / 2, 0, 0]);
    }
    const s = R.at(0, 0, 0);
    add(s, cyl(2.2, 2.2, 0.15, 24), T('stripes', RED, GOLD, 8, 1), 0, 0.08, 4);
    for (const [x, z] of [[-1, 4], [0.6, 4.4], [0, 3.1]]) add(s, ball(0.28, 10), M(0x2a2a36), x, 0.35, z);
    let next = 4;
    let side = 0;
    this.anims.push((t) => {
      if (t < next) return;
      next = t + 7.5;
      const { p, d } = muzzle(barrels[side++ % 2].barrel);
      this.burst.fire(p.x, p.y, p.z, d.x, d.y, d.z, 52);
    });
    // a net hung on the north side
    add(s, tor(1.8, 0.07, 28), M(CREAM), 0, 2.2, -6.7, [0, 0, 0]);
  }

  // ---------- 🌳 Hydroponics → The Topiary Garden ----------
  room_hydroponics(R) {
    const s = R.at(0, 0, 0);
    const leaf = M(0x2e8f3a, { r: 0.9 });
    const leaf2 = M(0x58c94a, { r: 0.9 });
    // a snowman-shaped topiary with a party hat
    for (const [r, y] of [[0.75, 0.75], [0.55, 1.85], [0.38, 2.7]]) add(s, ball(r, 14), leaf, -5.3, y, -2.8);
    add(s, new THREE.ConeGeometry(0.28, 0.6, 8), M(PINK), -5.3, 3.3, -2.8);
    add(s, ball(0.09, 6), M(GOLD, { e: 0.6 }), -5.3, 3.65, -2.8);
    // a stack of cones, like a fir tree wearing balloons
    for (const [r, h, y] of [[0.9, 1.2, 0.7], [0.7, 1.1, 1.6], [0.5, 1.0, 2.4]]) add(s, new THREE.ConeGeometry(r, h, 10), leaf2, -2.2, y, -3.3);
    for (const [x, y, c] of [[-2.7, 1.2, RED], [-1.8, 1.8, GOLD], [-2.3, 2.5, TEAL]]) balloonAt(s, x, y, -2.8, c, 0.16);
    // hedges with colourful flowers, a fountain, giant sunflowers
    for (const x of [-5, -1.5, 2]) {
      add(s, box(2.4, 0.5, 1.0), M(0x4a3423), x, 0.25, 3.8);
      for (let k = 0; k < 4; k++) balloonAt(s, x - 0.9 + k * 0.6, 0.78, 3.8, PALETTE[(k + (x > 0 ? 3 : 0)) % PALETTE.length], 0.2);
    }
    add(s, cyl(1.5, 1.6, 0.4, 22), M(0xb8bfd0), 5.2, 0.2, -2.8);
    add(s, cyl(1.3, 1.3, 0.1, 22), M(0x3fb8ff, { e: 0.5, o: 0.7 }), 5.2, 0.42, -2.8);
    add(s, cyl(0.15, 0.2, 1.2, 10), M(0xb8bfd0), 5.2, 0.9, -2.8);
    add(s, ball(0.28, 10), M(0x7fd4ff, { e: 0.8, o: 0.8 }), 5.2, 1.6, -2.8);
    for (const [x, z] of [[-6.8, 0.8], [-0.2, -4.6], [6.8, 1], [3.6, -5.2]]) {
      add(s, cyl(0.04, 0.05, 1.8, 6), leaf, x, 0.9, z);
      add(s, cyl(0.38, 0.38, 0.06, 16), M(GOLD, { e: 0.4 }), x, 1.85, z, [Math.PI / 2, 0.2, 0]);
      add(s, cyl(0.17, 0.17, 0.09, 12), M(0x5a3a1a), x, 1.86, z + 0.02, [Math.PI / 2, 0.2, 0]);
    }
  }

  // ---------- 🚀 Airlock → The Human Cannon ----------
  room_airlock(R) {
    const g = R.at(1.6, 0, 2.2, 0.1, true);
    const barrel = circusCannon(g, RED);
    barrel.scale.setScalar(1.15);
    // curtain over the old airlock door, and a bullseye
    const s = R.at(0, 0, 0);
    add(s, box(0.2, 2.5, 6.8), T('stripes', RED, GOLD, 8, 1), -3.45, 1.25, 0);
    add(s, box(0.14, 0.2, 6.9), M(GOLD, { e: 0.5 }), -3.45, 2.55, 0);
    add(s, cyl(1.5, 1.5, 0.1, 28), M(CREAM), -3.3, 1.5, 0, [0, 0, Math.PI / 2]);
    for (const [r, c] of [[1.2, RED], [0.8, CREAM], [0.4, RED]]) add(s, cyl(r, r, 0.12, 28), M(c), -3.28, 1.5, 0, [0, 0, Math.PI / 2]);
    for (const z of [-3.4, 3.4]) balloonAt(s, -3.0, 2.8, z, z < 0 ? TEAL : PINK, 0.3);
    // a safety net and a "fire here" sign: the cannon goes off now and then
    let next = 6;
    this.anims.push((t) => {
      if (t < next) return;
      next = t + 9;
      const { p, d } = muzzle(barrel);
      this.burst.fire(p.x, p.y, p.z, d.x, d.y, d.z, 56);
    });
  }

  // ---------- 🚐 Crew Quarters → The Caravans ----------
  room_quarters(R) {
    const s = R.at(0, 0, 0);
    [[-3.6, TEAL], [0.4, PINK]].forEach(([x, c], i) => {
      add(s, box(2.6, 1.5, 1.7), M(c, { r: 0.45 }), x, 1.0, -3.7);
      add(s, halfCyl(0.88, 2.6), M(i ? PURPLE : ORANGE), x, 1.75, -3.7, [0, 0, Math.PI / 2], [1, 1, 1]);
      add(s, box(0.55, 0.55, 0.06), M(0xfff0a0, { e: 1.2 }), x - 0.6, 1.2, -2.83);
      add(s, box(0.6, 1.0, 0.06), M(0x5a3a1a), x + 0.65, 0.85, -2.83);
      for (const wx of [-0.8, 0.8]) add(s, cyl(0.4, 0.4, 0.2, 14), M(0x2a2a36), x + wx, 0.4, -2.75, [Math.PI / 2, 0, 0]);
      add(s, cyl(0.02, 0.02, 0.6, 4), M(CREAM), x + 1.4, 0.3, -3.7, [0, 0, Math.PI / 2]);
    });
    // the clown car, with far too many hats poking out
    const c = R.at(-3.2, 0, 2.6, 0.5);
    add(c, box(2.2, 0.7, 1.1), T('dots', GOLD, RED, 2, 1), 0, 0.65, 0);
    add(c, box(1.1, 0.55, 1.0), M(0xcfe9ff, { o: 0.5 }), -0.1, 1.25, 0);
    for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) add(c, cyl(0.28, 0.28, 0.2, 12), M(0x2a2a36), x, 0.28, z, [Math.PI / 2, 0, 0]);
    add(c, ball(0.2, 10), M(RED, { e: 0.7 }), 1.15, 0.7, 0);
    [[-0.5, PALETTE[0]], [-0.1, PALETTE[2]], [0.3, PALETTE[4]], [-0.3, PALETTE[5]], [0.1, PALETTE[3]]].forEach(([x, col], i) => add(c, new THREE.ConeGeometry(0.16, 0.45, 8), M(col), x, 1.8 + (i % 2) * 0.12, ((i * 3) % 5 - 2) * 0.12));
    // a campfire ring of logs and a string of lights
    add(s, tor(0.8, 0.1, 16), M(0x5a3a1a), 3.6, 0.1, 2.4, [Math.PI / 2, 0, 0]);
    for (const a of [0, 1.2, 2.4, 3.6, 4.8]) add(s, new THREE.ConeGeometry(0.18, 0.7, 6), M(ORANGE, { e: 1.2 }), 3.6 + Math.cos(a) * 0.15, 0.45, 2.4 + Math.sin(a) * 0.15, [0, 0, 0]);
  }

  // ---------- 🎲 Cargo Bay → The Prop Room ----------
  room_cargo(R) {
    const s = R.at(0, 0, 0);
    // giant dice
    [[-7.3, -3, 0.4], [-5.3, -3.6, 0.9]].forEach(([x, z, ry], i) => add(s, box(1.3 - i * 0.2, 1.3 - i * 0.2, 1.3 - i * 0.2), diceMat(), x, 0.65 - i * 0.1, z, [0, ry, 0]));
    // trunks with curved lids
    [[-8, 2.4, RED], [-5.6, 3.1, PURPLE], [-2.6, 3.0, TEAL]].forEach(([x, z, c]) => {
      add(s, box(1.6, 0.8, 1.0), M(c), x, 0.4, z);
      add(s, halfCyl(0.5, 1.6), M(c), x, 0.8, z, [0, 0, Math.PI / 2]);
      add(s, box(1.62, 0.1, 0.08), M(GOLD, { e: 0.5 }), x, 0.55, z + 0.52);
    });
    // juggling pins in a rack
    add(s, box(2.4, 0.3, 0.6), M(0x6b3b1a), 2, 0.15, -4.2);
    for (let i = 0; i < 5; i++) {
      add(s, new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), M(i % 2 ? RED : CREAM), 1.1 + i * 0.45, 0.75, -4.2);
      add(s, ball(0.09, 8), M(i % 2 ? RED : CREAM), 1.1 + i * 0.45, 1.3, -4.2);
    }
    // stacked top hats
    for (const [y, c] of [[0.3, 0x1a1020], [0.85, 0x1a1020], [1.4, 0x1a1020]]) {
      add(s, cyl(0.45, 0.45, 0.55, 14), M(c), 5, y, -3.9);
      add(s, cyl(0.47, 0.47, 0.12, 14), M(RED), 5, y - 0.05, -3.9);
    }
    // a unicycle leaning on the wall
    add(s, tor(0.55, 0.06, 20), M(0x2a2a36), -1.2, 0.62, -4.4, [0, 0.15, 0]);
    add(s, cyl(0.03, 0.03, 1.0, 5), M(GOLD), -1.2, 1.3, -4.4);
    add(s, box(0.4, 0.1, 0.3), M(RED), -1.2, 1.82, -4.4);
    // the magician's cabinet
    add(s, box(1.8, 3.2, 1.3), M(0x4a1f9a), 7.4, 1.6, -2.4);
    add(s, box(1.5, 2.8, 0.06), cabinetMat(), 7.4, 1.6, -1.73);
    add(s, box(1.9, 0.14, 1.4), M(GOLD, { e: 0.5 }), 7.4, 3.25, -2.4);
    add(s, ball(0.18, 8), M(GOLD, { e: 0.7 }), 7.4, 3.45, -2.4);
    // a rubber chicken on a trunk
    add(s, new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), M(GOLD, { r: 0.3 }), -5.6, 1.45, 3.1, [0, 0, 1.2]);
    add(s, ball(0.13, 8), M(GOLD, { r: 0.3 }), -5.3, 1.65, 3.1);
    add(s, new THREE.ConeGeometry(0.06, 0.2, 5), M(ORANGE), -5.15, 1.62, 3.1, [0, 0, -Math.PI / 2]);
  }

  // ---------- 🎪 Bridge → The Center Ring ----------
  room_bridge(R) {
    // the ringmaster's podium, and drums to stand on either side
    const s = R.at(0, 0, -9);
    add(s, cyl(1.3, 1.4, 0.5, 20), T('stripes', RED, CREAM, 10, 1), 0, 0.25, 0);
    add(s, cyl(0.9, 1.0, 0.5, 20), T('stripes', TEAL, CREAM, 8, 1), 0, 0.75, 0);
    add(s, cyl(0.5, 0.6, 0.5, 20), M(GOLD, { e: 0.5 }), 0, 1.25, 0);
    for (const x of [-3, 3]) {
      add(s, cyl(0.7, 0.7, 0.7, 16), T('stripes', PURPLE, GOLD, 8, 1), x, 0.35, 0.2);
      balloonAt(s, x, 1.7, 0.2, x < 0 ? PINK : GREEN);
    }
    const star = R.at(0, 2.2, -9, 0, true);
    add(star, new THREE.OctahedronGeometry(0.4), M(GOLD, { e: 1.2 }), 0, 0, 0, null, [1, 1, 0.45]);
    this.anims.push((t, dt) => {
      star.rotation.y += dt * 1.2;
      star.position.y = 2.2 + Math.sin(t * 2) * 0.1;
    });
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    this.burst.update(dt);
  }
}

// shared with the Carnival's exterior
export { M, T, add, cyl, box, ball, tor, mergeStatic, PALETTE, RED, GOLD, CREAM, PINK, TEAL, PURPLE, BLUE };
