// Ambience: the little things that make each room feel alive. Steam off the
// galley pot, sparks from the reactor, embers drifting out of the engines,
// fireflies and sprinklers in hydroponics, a heart monitor in the medbay,
// signal rings over the comms dish, a star-chart hologram in navigation,
// spinning warning beacons, frost creeping in at the airlock, a lava lamp and
// a fish tank in the crew quarters, steam vents in the corridors, and Sweepy,
// the cleaning robot who potters along the south deck.
//
// Purely for looks (nothing here blocks anyone). Uses glow and particles only,
// no extra real lights, so it stays cheap. "Low" graphics halves the particles.
import * as THREE from 'three';

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...extra });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

function add(group, geometry, material, x = 0, y = 0, z = 0, rot = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  group.add(mesh);
  return mesh;
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A pool of particles drawn in one call. Brightness fades in and out over each
// particle's life (they are added on top of the scene, so dark = invisible).
class Particles {
  constructor(parent, count, size, texture) {
    this.count = count;
    this.items = Array.from({ length: count }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, r: 1, gr: 1, b: 1 }));
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: texture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.next = 0;
  }

  spawn(p) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.count;
    Object.assign(it, { g: 0, drag: 0, ...p, life: p.max });
  }

  update(dt, dim) {
    for (let i = 0; i < this.count; i++) {
      const p = this.items[i];
      if (p.life <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      p.life -= dt;
      p.vy -= p.g * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const age = 1 - p.life / p.max; // 0 → 1
      const k = Math.max(0, Math.min(1, age * 5, (1 - age) * 2.5)) * dim;
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.col.set([p.r * k, p.gr * k, p.b * k], i * 3);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

// The ECG on the medbay monitor, drawn into a small canvas.
function heartMonitor() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const trace = new Float32Array(256).fill(64);
  let x = 0;
  let beat = 0;
  return {
    tex,
    // advance the trace; a heartbeat every ~0.95 s (the medbay sound beeps in time)
    update(dt, t, fast) {
      const step = Math.max(1, Math.round(dt * 160));
      for (let s = 0; s < step; s++) {
        beat += 1 / 160;
        const period = fast ? 0.55 : 0.95;
        const p = (beat % period) / period;
        let y = 64 + Math.sin(t * 2 + s) * 0.8;
        if (p > 0.1 && p < 0.14) y = 52; // P wave
        else if (p > 0.2 && p < 0.22) y = 80;
        else if (p >= 0.22 && p < 0.25) y = 14; // the spike
        else if (p >= 0.25 && p < 0.28) y = 92;
        else if (p > 0.42 && p < 0.5) y = 56; // T wave
        trace[x] = y;
        x = (x + 1) % 256;
      }
      g.fillStyle = '#04140c';
      g.fillRect(0, 0, 256, 128);
      g.strokeStyle = 'rgba(80,255,160,0.12)';
      g.lineWidth = 1;
      for (let gx = 0; gx < 256; gx += 32) g.strokeRect(gx, 0, 32, 128);
      g.strokeStyle = '#7dffb0';
      g.lineWidth = 3;
      g.shadowColor = '#7dffb0';
      g.shadowBlur = 8;
      g.beginPath();
      for (let i = 0; i < 256; i++) {
        const k = (x + i) % 256;
        if (i === 0) g.moveTo(i, trace[k]);
        else g.lineTo(i, trace[k]);
      }
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = '#7dffb0';
      g.font = 'bold 22px monospace';
      g.fillText(fast ? '♥ 128' : '♥ 72', 186, 26);
      tex.needsUpdate = true;
    },
  };
}

// A spinning warning beacon: a glowing dome with two light blades sweeping round.
function beacon(parent, x, y, z, color) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  add(b, new THREE.CylinderGeometry(0.16, 0.2, 0.14, 12), m(0x30364a, { metalness: 0.7 }));
  add(b, new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow(color, 0.95), 0, 0.07, 0);
  const spin = new THREE.Group();
  spin.position.y = 0.14;
  // two flat wedges of light, like a lighthouse seen from above
  const wedge = new THREE.CircleGeometry(3.2, 10, -0.22, 0.44);
  wedge.rotateX(-Math.PI / 2);
  for (const a of [0, Math.PI]) add(spin, wedge, glow(color, 0.2), 0, 0, 0, [0, a, 0]);
  b.add(spin);
  parent.add(b);
  return spin;
}

// Merge the pieces that never move into one mesh per material (fewer draw calls).
function mergeStill(still) {
  still.updateMatrix();
  const buckets = new Map();
  for (const mesh of still.children) {
    mesh.updateMatrix();
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(mesh);
  }
  still.clear();
  for (const [material, meshes] of buckets) {
    const parts = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrix).toNonIndexed());
    const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    let at = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, at * 3);
      nor.set(g.attributes.normal.array, at * 3);
      at += g.attributes.position.count;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.computeBoundingSphere();
    still.add(new THREE.Mesh(geometry, material));
  }
}

export function buildAmbience(ship, { lowFx = false } = {}) {
  const root = new THREE.Group();
  root.userData.dynamic = true;
  ship.add(root);
  const dot = softDot();
  const soft = new Particles(root, lowFx ? 90 : 180, 1.25, dot); // steam, mist
  const spark = new Particles(root, lowFx ? 160 : 320, 0.17, dot); // sparks, embers, drops, bubbles
  const rate = lowFx ? 0.5 : 1;
  const emitters = [];
  // something that spawns `perSecond` particles (fractions carry over between frames)
  const emitter = (perSecond, fn) => emitters.push({ perSecond: perSecond * rate, acc: Math.random(), fn });
  const metal = m(0x4a5272, { metalness: 0.75, roughness: 0.35 });
  const still = new THREE.Group(); // pieces that never move: merged into a few meshes at the end
  root.add(still);

  // ---------- galley: steam off the big pot ----------
  emitter(6, () => soft.spawn({ x: 31 + rand(-0.3, 0.3), y: 1.1, z: -3 + rand(-0.3, 0.3), vx: rand(-0.1, 0.1), vy: rand(0.4, 0.6), vz: rand(-0.1, 0.1), drag: 0.2, max: rand(2.6, 3.4), r: 0.2, gr: 0.19, b: 0.18 }));

  // ---------- reactor: energy rings climbing the core, and sparks ----------
  const reactorRings = [0, 1, 2].map((i) => {
    const ring = add(root, new THREE.TorusGeometry(1.2, 0.05, 6, 40), glow(0xffe3ec, 0.9), -26, 0.4, 24, [Math.PI / 2, 0, 0]);
    ring.userData.offset = i / 3;
    return ring;
  });
  const reactorSparks = () => {
    const a = rand(0, Math.PI * 2);
    const y = rand(0.6, 3);
    for (let i = 0; i < 12; i++) {
      const s = rand(1.2, 3);
      spark.spawn({ x: -26 + Math.cos(a) * 1.15, y, z: 24 + Math.sin(a) * 1.15, vx: Math.cos(a + rand(-0.6, 0.6)) * s, vy: rand(0.5, 2.5), vz: Math.sin(a + rand(-0.6, 0.6)) * s, g: 6, drag: 0.6, max: rand(0.4, 0.9), r: 1, gr: 0.75, b: 0.85 });
    }
  };
  let reactorNext = 1;

  // ---------- engine room: embers drifting out of the nozzles ----------
  emitter(9, () => {
    const x = Math.random() < 0.5 ? -5 : 5;
    const a = rand(0, Math.PI * 2);
    const r = rand(0, 1.2);
    spark.spawn({ x: x + Math.cos(a) * r, y: 1.8 + Math.sin(a) * r, z: 30.1, vx: rand(-0.3, 0.3), vy: rand(0.3, 0.9), vz: rand(0.6, 1.4), drag: 0.4, max: rand(1.2, 2), r: 1, gr: rand(0.45, 0.65), b: 0.15 });
  });
  // heat shimmer: the nozzle glow breathes
  const nozzles = [-5, 5].map((x) => add(root, new THREE.CircleGeometry(1.25, 24), glow(0xbfe9ff, 0.25), x, 1.8, 30.05));

  // ---------- hydroponics: sprinkler pipe, falling drops, and fireflies ----------
  add(still, new THREE.CylinderGeometry(0.05, 0.05, 11, 8), metal, 25.8, 2.25, 21.3, [0, 0, Math.PI / 2]);
  for (let x = 21; x <= 31; x += 2.5) add(still, new THREE.CylinderGeometry(0.035, 0.02, 0.14, 6), metal, x, 2.16, 21.3);
  emitter(18, () => spark.spawn({ x: rand(20.8, 30.8), y: 2.1, z: 21.3 + rand(-0.15, 0.15), vx: 0, vy: -0.4, vz: rand(-0.05, 0.25), g: 7, max: 0.7, r: 0.55, gr: 0.85, b: 1 }));
  const FIREFLIES = lowFx ? 8 : 16;
  const flies = Array.from({ length: FIREFLIES }, () => ({ x: rand(20.5, 31.5), y: rand(0.9, 2.2), z: rand(20, 28), s: rand(0.3, 0.7), p: rand(0, 6.28) }));
  const flyPos = new Float32Array(FIREFLIES * 3);
  const flyCol = new Float32Array(FIREFLIES * 3);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
  const fireflies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ size: 0.3, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fireflies.frustumCulled = false;
  root.add(fireflies);

  // ---------- medbay: a heart monitor between the beds, and the scanner sweeping ----------
  const monitor = heartMonitor();
  add(still, new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), metal, -28, 0.65, -4.65);
  add(still, new THREE.BoxGeometry(1.4, 0.76, 0.08), m(0x22283a), -28, 1.6, -4.67);
  add(root, new THREE.PlaneGeometry(1.3, 0.66), new THREE.MeshBasicMaterial({ map: monitor.tex }), -28, 1.6, -4.62);
  const scanRing = add(root, new THREE.TorusGeometry(1.0, 0.03, 6, 36), glow(0x7dffb0, 0.9), -22, 0.2, -3, [Math.PI / 2, 0, 0]);
  const scanDisc = add(root, new THREE.CircleGeometry(1.0, 36), glow(0x7dffb0, 0.08), -22, 0.2, -3, [-Math.PI / 2, 0, 0]);

  // ---------- comms: signal rings rising off the dish, and a blinking mast light ----------
  const signalRings = [0, 1, 2].map((i) => {
    const ring = add(root, new THREE.TorusGeometry(1, 0.025, 6, 40), glow(0x7cc7ff, 0.7), 22, 2.3, -23.7, [Math.PI / 2 - 0.9, 0, 0]);
    ring.userData.offset = i / 3;
    return ring;
  });
  add(still, new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), metal, 30.5, 1.7, -21);
  const mastLight = add(root, new THREE.SphereGeometry(0.08, 8, 6), glow(0xff3344, 1), 30.5, 2.45, -21);

  // ---------- navigation: a rotating star-chart hologram over the map table ----------
  const nav = new THREE.Group();
  nav.position.set(-26, 1.85, -23);
  nav.scale.setScalar(1.4);
  add(nav, new THREE.ConeGeometry(1.0, 0.95, 24, 1, true), glow(0x58ffd0, 0.07), 0, -0.5, 0, [Math.PI, 0, 0]);
  const planet = add(nav, new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: 0x58ffd0, wireframe: true, transparent: true, opacity: 0.75 }));
  const orbit = new THREE.Group();
  orbit.rotation.set(0.45, 0, 0.2);
  add(orbit, new THREE.TorusGeometry(0.85, 0.012, 4, 48), glow(0x9dffe6, 0.6), 0, 0, 0, [Math.PI / 2, 0, 0]);
  const moon = add(orbit, new THREE.SphereGeometry(0.08, 10, 8), glow(0xffffff, 0.95), 0.85, 0, 0);
  nav.add(orbit);
  root.add(nav);

  // ---------- warning beacons: cargo bay doors and the airlock ----------
  const beacons = [beacon(root, -6, 2.62, 38, 0xffb02e), beacon(root, 6, 2.62, 38, 0xffb02e), beacon(root, -47.7, 2.46, 0, 0xff2b2b)];

  // ---------- airlock: frost creeping in under the outer door ----------
  emitter(4, () => soft.spawn({ x: -47.3, y: rand(0.1, 0.3), z: rand(-2.8, 2.8), vx: rand(0.25, 0.5), vy: rand(0, 0.06), vz: rand(-0.08, 0.08), drag: 0.15, max: rand(3, 4.5), r: 0.1, gr: 0.14, b: 0.2 }));

  // ---------- crew quarters: a lava lamp and a fish tank on the north wall ----------
  add(still, new THREE.BoxGeometry(0.9, 0.6, 0.55), m(0x3a3150), 43.3, 0.3, -5.2);
  add(still, new THREE.CylinderGeometry(0.1, 0.17, 0.16, 12), m(0xc9a24a, { metalness: 0.8 }), 43.3, 0.68, -5.2);
  add(still, new THREE.CylinderGeometry(0.15, 0.11, 0.62, 16), new THREE.MeshStandardMaterial({ color: 0xb05bff, emissive: 0x5a1fa0, emissiveIntensity: 0.9, transparent: true, opacity: 0.45 }), 43.3, 1.07, -5.2);
  add(still, new THREE.CylinderGeometry(0.07, 0.15, 0.12, 12), m(0xc9a24a, { metalness: 0.8 }), 43.3, 1.43, -5.2);
  const blobMat = glow(0xff7a3c, 0.95);
  const blobs = [0.05, 0.065, 0.045].map((r, i) => {
    const b = add(root, new THREE.SphereGeometry(r, 10, 8), blobMat, 43.3, 1, -5.2);
    b.userData = { speed: 0.35 + i * 0.13, phase: i * 2.1 };
    return b;
  });
  // the tank
  add(still, new THREE.BoxGeometry(1.5, 0.75, 0.6), m(0x2a2438), 49.5, 0.375, -5.15);
  add(still, new THREE.BoxGeometry(1.4, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x3fb8ff, emissive: 0x0d4f7a, emissiveIntensity: 0.9, transparent: true, opacity: 0.4 }), 49.5, 1.1, -5.15);
  add(still, new THREE.BoxGeometry(1.42, 0.05, 0.52), m(0x8a7a5a), 49.5, 0.77, -5.15); // gravel
  const fish = [0xff8a1a, 0xffd93b, 0xff5fa2].map((c, i) => {
    const f = new THREE.Group();
    add(f, new THREE.SphereGeometry(0.07, 8, 6), m(c, { emissive: c, emissiveIntensity: 0.35 })).scale.set(1.5, 1, 0.6);
    add(f, new THREE.ConeGeometry(0.05, 0.08, 4), m(c, { emissive: c, emissiveIntensity: 0.35 }), -0.13, 0, 0, [0, 0, Math.PI / 2]);
    f.userData = { speed: 0.4 + i * 0.17, phase: i * 1.7, y: 0.92 + i * 0.13 };
    root.add(f);
    return f;
  });
  emitter(3, () => spark.spawn({ x: 49.5 + rand(-0.55, 0.55), y: 0.85, z: -5.15 + rand(-0.15, 0.15), vx: 0, vy: rand(0.25, 0.4), vz: 0, max: 1.3, r: 0.5, gr: 0.75, b: 1 }));

  // ---------- corridors: steam vents that puff now and then ----------
  const VENTS = [[0, -14], [0, 14], [-14, 0], [14, 0], [-26, -13], [26, 13], [-14, 25], [14, 25], [0, 35], [-37, 0], [37, 0]];
  const ventMat = m(0x1b2030, { metalness: 0.6 });
  for (const [x, z] of VENTS) {
    add(still, new THREE.BoxGeometry(0.9, 0.03, 0.6), ventMat, x, 0.02, z);
    for (let k = -2; k <= 2; k++) add(still, new THREE.BoxGeometry(0.06, 0.035, 0.5), metal, x + k * 0.16, 0.035, z);
  }
  let ventNext = 3;
  let onVent = null;
  const puff = ([x, z]) => {
    for (let i = 0; i < 22 * rate; i++) soft.spawn({ x: x + rand(-0.3, 0.3), y: 0.1, z: z + rand(-0.2, 0.2), vx: rand(-0.3, 0.3), vy: rand(1.2, 2.2), vz: rand(-0.3, 0.3), drag: 1.6, max: rand(1.2, 2), r: 0.17, gr: 0.18, b: 0.21 });
    onVent?.(x, z);
  };

  // ---------- Sweepy, the cleaning robot (south deck: reactor → engine room → hydroponics) ----------
  const bot = new THREE.Group();
  add(bot, new THREE.CylinderGeometry(0.32, 0.34, 0.14, 20), m(0xdfe4ee, { metalness: 0.4, roughness: 0.4 }), 0, 0.1, 0);
  add(bot, new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6cf0ff, emissive: 0x1a6a7a, emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }), 0, 0.17, 0);
  const botLed = add(bot, new THREE.SphereGeometry(0.035, 6, 5), glow(0x5bff8f, 1), 0, 0.15, 0.31);
  const brushes = [-1, 1].map((s) => {
    const br = new THREE.Group();
    br.position.set(s * 0.22, 0.03, 0.22);
    for (const a of [0, Math.PI / 2]) add(br, new THREE.BoxGeometry(0.22, 0.01, 0.025), m(0xffb547), 0, 0, 0, [0, a, 0]);
    bot.add(br);
    return br;
  });
  bot.scale.setScalar(1.35);
  root.add(bot);
  const route = { from: -21.5, to: 22.5, z: 24.6, x: -21.5, dir: 1, wait: 0, turn: 0 };
  let onChirp = null;

  mergeStill(still);

  // ---------- animation ----------
  return {
    sweepy: bot,
    set onVent(fn) {
      onVent = fn;
    },
    set onChirp(fn) {
      onChirp = fn;
    },
    update(dt, t, { night = false, progress = 0, alarm = false } = {}) {
      const dim = night ? 0.45 : 1;
      for (const e of emitters) {
        e.acc += e.perSecond * dt;
        while (e.acc >= 1) {
          e.acc -= 1;
          e.fn();
        }
      }
      // the reactor spits more sparks as the black hole closes in
      reactorNext -= dt * (1 + progress * 3);
      if (reactorNext <= 0) {
        reactorSparks();
        reactorNext = rand(1.2, 3.5);
      }
      ventNext -= dt;
      if (ventNext <= 0) {
        puff(VENTS[Math.floor(Math.random() * VENTS.length)]);
        ventNext = rand(2.5, 6);
      }
      soft.update(dt, dim);
      spark.update(dt, dim);

      for (const r of reactorRings) {
        const k = (t * 0.35 + r.userData.offset) % 1;
        r.position.y = 0.4 + k * 2.9;
        r.material.opacity = Math.sin(k * Math.PI) * 0.85 * dim;
      }
      for (const n of nozzles) n.material.opacity = (0.2 + Math.sin(t * 9 + n.position.x) * 0.05 + Math.random() * 0.05) * dim;

      flies.forEach((f, i) => {
        const a = t * f.s + f.p;
        flyPos.set([f.x + Math.sin(a) * 0.8, f.y + Math.sin(a * 1.7) * 0.3, f.z + Math.cos(a * 0.9) * 0.8], i * 3);
        const tw = Math.max(0, Math.sin(t * 2.3 + f.p * 3)) * (night ? 1.4 : 1.1);
        flyCol.set([0.75 * tw, 1 * tw, 0.3 * tw], i * 3);
      });
      flyGeo.attributes.position.needsUpdate = true;
      flyGeo.attributes.color.needsUpdate = true;

      monitor.update(dt, t, alarm || progress > 0.8);
      const sy = 0.2 + (0.5 - 0.5 * Math.cos(t * 1.4)) * 2;
      scanRing.position.y = sy;
      scanDisc.position.y = sy;

      for (const r of signalRings) {
        const k = (t * 0.45 + r.userData.offset) % 1;
        r.scale.setScalar(0.3 + k * 1.6);
        r.position.y = 2.3 + k * 1.1;
        r.material.opacity = (1 - k) * 0.7 * dim;
      }
      mastLight.material.opacity = (t % 1.6) < 0.18 ? 1 : 0.1;

      nav.rotation.y = t * 0.35;
      planet.rotation.x = t * 0.2;
      moon.position.set(Math.cos(t * 1.1) * 0.85, 0, Math.sin(t * 1.1) * 0.85);

      beacons.forEach((b, i) => (b.rotation.y = t * (alarm ? 9 : 3.2) + i));

      blobs.forEach((b) => {
        const k = 0.5 - 0.5 * Math.cos(t * b.userData.speed + b.userData.phase);
        b.position.y = 0.84 + k * 0.42;
        b.scale.set(1, 1 + Math.sin(t * 2 + b.userData.phase) * 0.25, 1);
      });
      fish.forEach((f) => {
        const a = t * f.userData.speed + f.userData.phase;
        f.position.set(49.5 + Math.sin(a) * 0.55, f.userData.y + Math.sin(a * 2.3) * 0.04, -5.15 + Math.cos(a * 1.3) * 0.12);
        f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI; // turn round at each end
      });

      // Sweepy trundles along, pauses at each end, turns round and chirps
      if (route.wait > 0) {
        route.wait -= dt;
        bot.rotation.y += (Math.atan2(route.dir, 0) - bot.rotation.y) * Math.min(1, dt * 4);
      } else {
        route.x += route.dir * dt * 1.1;
        if ((route.dir > 0 && route.x >= route.to) || (route.dir < 0 && route.x <= route.from)) {
          route.dir *= -1;
          route.wait = rand(1.5, 3);
          onChirp?.(route.x, route.z);
        }
        bot.rotation.y = Math.atan2(route.dir, 0);
      }
      bot.position.set(route.x, 0, route.z + Math.sin(route.x * 0.7) * 0.25);
      for (const br of brushes) br.rotation.y = t * 14;
      botLed.material.opacity = (t % 1) < 0.5 ? 1 : 0.25;
    },
  };
}
