// Ruler of the Galaxy: the six contenders, in 3D, and the flagship that carries one round the arena.
//
//   Mecha-Nova Prime        the KayKit Combat Mech, on cyan thrusters
//   The Void Kraken         the tentacled horror from No More Space, without its host
//   Cyber-Hive Xenos        a hexagonal hive ship in a cloud of drones
//   Solaris Star-Eater      a living plasma star in containment rings, with a face
//   Chronos Syndicate       a Kenney speeder in a spinning clock ring, towing a singularity
//   Goliath Asteroid-Walker a magma-cracked asteroid on legs, with turrets and thrusters
//
// Each builder returns a group about 2.6 units tall standing on y = 0, and an animate(t, camera) function.
import * as THREE from 'three';
import { cloneSkinned, loadModels, clipsOf, model } from '../../world/assets.js';
import { outlineSkinned, outlineEach } from '../../world/outline.js';
import { plasmaMaterial, glowRing } from './arena.js';
import { glowTexture } from './galaxy.js';

const HEIGHT = 2.6;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.4, ...o });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
let GLOW = null;
const glowSprite = (color, size) => {
  GLOW ||= glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
};

// a flickering jet of flame (points down -y from its origin)
function thruster(color, length = 0.9, width = 0.18) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(width, length, 16, 1, true), glowMat(color));
  outer.material.opacity = 0.75;
  outer.rotation.x = Math.PI;
  outer.position.y = -length / 2;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(width * 0.45, length * 0.7, 12, 1, true), glowMat(0xffffff));
  inner.rotation.x = Math.PI;
  inner.position.y = -length * 0.35;
  g.add(outer, inner, glowSprite(color, width * 6));
  g.userData.flicker = (t, k = 1) => {
    const f = 0.85 + Math.sin(t * 37 + g.id) * 0.1 + Math.random() * 0.1;
    g.scale.set(1, f * k, 1);
  };
  return g;
}

// scale a model so it is HEIGHT tall and stands on y = 0
function fit(obj, height = HEIGHT) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const k = height / Math.max(0.01, box.max.y - box.min.y);
  obj.scale.multiplyScalar(k);
  obj.position.y -= box.min.y * k;
  return obj;
}

// ---------------------------------------------------------------------------
// The builders
// ---------------------------------------------------------------------------

function buildMecha(color) {
  const g = new THREE.Group();
  const anim = { mixer: null };
  const jets = [];
  for (const s of [-1, 1]) {
    const j = thruster(color, 1.3, 0.2);
    j.position.set(s * 0.45, 1.5, -0.45);
    j.rotation.x = 0.35;
    g.add(j);
    jets.push(j);
  }
  const visor = glowSprite(color, 1.6);
  visor.position.set(0, 2.25, 0.3);
  g.add(visor);
  Promise.all([cloneSkinned('ruler/combatmech'), loadModels(['characters/anims'])]).then(([mech]) => {
    if (!mech) return;
    fit(mech, HEIGHT * 1.15);
    g.add(mech);
    outlineSkinned(mech, 0.025);
    const idle = THREE.AnimationClip.findByName(clipsOf('characters/anims'), 'Idle_B') || THREE.AnimationClip.findByName(clipsOf('characters/anims'), 'Idle_A');
    if (idle) {
      anim.mixer = new THREE.AnimationMixer(mech);
      anim.mixer.clipAction(idle).play();
    }
  });
  let last = 0;
  return {
    group: g,
    animate(t) {
      anim.mixer?.update(Math.min(0.1, Math.max(0, t - last)));
      last = t;
      for (const j of jets) j.userData.flicker(t);
      visor.material.opacity = 0.6 + Math.sin(t * 3) * 0.2;
    },
  };
}

function buildKraken(color, camera) {
  const g = new THREE.Group();
  let creature = null;
  import('../../world/parasite.js').then(({ buildParasite }) => {
    creature = buildParasite(new THREE.Color(color).getHex());
    creature.getObjectByName('host-helmet')?.removeFromParent();
    fit(creature, HEIGHT * 1.1);
    g.add(creature);
  });
  // a violet rift it swims out of
  const rift = glowRing(1.6, 0.05, color, 0.8);
  rift.rotation.x = Math.PI / 2;
  rift.position.y = 0.05;
  g.add(rift);
  return {
    group: g,
    animate(t) {
      creature?.userData.anim?.tick(t, camera);
      rift.rotation.z = t * 0.5;
      rift.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
    },
  };
}

function hexTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = color;
  x.lineWidth = 3;
  const r = 18;
  for (let row = -1; row < 10; row++) {
    for (let col = -1; col < 10; col++) {
      const cx = col * r * 1.75 + (row % 2) * r * 0.875;
      const cy = row * r * 1.5;
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        x.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      }
      x.closePath();
      x.globalAlpha = (row * 7 + col * 3) % 5 === 0 ? 1 : 0.55;
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildHive(color) {
  const g = new THREE.Group();
  const hex = hexTexture('#00ff87');
  const shellMat = std(0x0c2a1f, { metalness: 0.7, roughness: 0.35, emissive: 0xffffff, emissiveMap: hex, emissiveIntensity: 0.9 });
  const darkMat = std(0x07140f, { metalness: 0.6, roughness: 0.5 });
  // the hive body: a six-sided carapace with a domed top
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 1.1, 6), shellMat);
  body.position.y = 1.1;
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.98, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  dome.position.y = 1.65;
  g.add(dome);
  const belly = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.8, 6), darkMat);
  belly.rotation.x = Math.PI;
  belly.position.y = 0.15;
  g.add(belly);
  // eyes: two green and one gold
  for (const [x, y, c, s] of [[-0.42, 1.25, 0x00ff87, 0.17], [0.42, 1.25, 0x00ff87, 0.17], [0, 1.55, 0xffb800, 0.14]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), glowMat(c));
    e.position.set(x, y, 0.98);
    const halo = glowSprite(c, s * 6);
    halo.position.set(x, y, 1.02);
    g.add(e, halo);
  }
  // mandibles
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 6), darkMat);
    m.position.set(s * 0.35, 0.75, 1.0);
    m.rotation.set(1.9, 0, s * 0.4);
    g.add(m);
  }
  // spines on the dome
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), glowMat(0x00ff87));
    sp.position.set(Math.cos(a) * 0.62, 2.25, Math.sin(a) * 0.62);
    sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(sp);
  }
  outlineEach(g, 0.025);
  // the swarm: little drones in rings round it
  const N = 42;
  const drones = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0x9dffcf }), N);
  g.add(drones);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  return {
    group: g,
    animate(t) {
      for (let i = 0; i < N; i++) {
        const ring = i % 3;
        const a = t * (0.9 + ring * 0.35) * (ring === 1 ? -1 : 1) + (i / N) * Math.PI * 2 * 3;
        const r = 1.6 + ring * 0.35;
        p.set(Math.cos(a) * r, 1.2 + Math.sin(a * 2 + ring) * 0.25 + (ring - 1) * 0.45, Math.sin(a) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        m.compose(p, q, sc);
        drones.setMatrixAt(i, m);
      }
      drones.instanceMatrix.needsUpdate = true;
      shellMat.emissiveIntensity = 0.7 + Math.sin(t * 2.2) * 0.3;
      hex.offset.y = t * 0.03;
    },
  };
}

function buildStarEater(color) {
  const g = new THREE.Group();
  const mat = plasmaMaterial('#fff6d0', '#ffb800', '#ff2a6d', 0.35);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 32), mat);
  sun.position.y = 1.35;
  g.add(sun);
  const halo = glowSprite(0xffb347, 5.2);
  halo.position.y = 1.35;
  g.add(halo);
  // a face, burning
  const face = new THREE.Group();
  face.position.set(0, 1.35, 0);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.scale.set(1, 1.35, 0.5);
    eye.position.set(s * 0.32, 0.18, 0.92);
    face.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a0610 }));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.22, 0.93);
  face.add(mouth);
  g.add(face);
  // containment rings, straining
  const ringMat = std(0x3a2a14, { metalness: 0.9, roughness: 0.25, emissive: 0xff8a1a, emissiveIntensity: 0.25 });
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * 0.12, 0.05, 8, 64), ringMat);
    r.position.y = 1.35;
    r.rotation.set(Math.PI / 2 + i * 0.6, i * 0.9, 0);
    g.add(r);
    rings.push(r);
    for (let k = 0; k < 4; k++) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), std(0x6a4a1a, { metalness: 0.9 }));
      const a = (k / 4) * Math.PI * 2;
      clamp.position.set(Math.cos(a) * (1.35 + i * 0.12), Math.sin(a) * (1.35 + i * 0.12), 0);
      r.add(clamp);
    }
  }
  // flares: sparks orbiting it
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(60 * 3).fill(0), 3)),
    new THREE.PointsMaterial({ color: 0xffc04d, size: 0.13, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  g.add(sparks);
  return {
    group: g,
    animate(t) {
      mat.uniforms.uTime.value = t;
      sun.scale.setScalar(1 + Math.sin(t * 2.3) * 0.03);
      halo.scale.setScalar(5.2 + Math.sin(t * 1.7) * 0.4);
      rings.forEach((r, i) => {
        r.rotation.z += 0.004 * (i + 1);
        r.rotation.y += 0.002 * (i % 2 ? -1 : 1);
      });
      face.position.y = 1.35 + Math.sin(t * 2) * 0.02;
      const pos = sparks.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const a = t * (0.6 + (i % 5) * 0.15) + i * 1.7;
        const r = 1.2 + ((i * 37) % 10) / 14 + Math.sin(t * 2 + i) * 0.1;
        pos.setXYZ(i, Math.cos(a) * r, 1.35 + Math.sin(a * 1.3 + i) * r * 0.6, Math.sin(a) * r);
      }
      pos.needsUpdate = true;
    },
  };
}

function buildChronos(color) {
  const g = new THREE.Group();
  const ship = new THREE.Group();
  g.add(ship);
  loadModels(['ruler/craft_speederD']).then(() => {
    const m = model('ruler/craft_speederD');
    if (!m) return;
    m.traverse((o) => {
      if (o.isMesh && o.material?.name === 'metalRed') o.material = std(0x2b7fbf, { metalness: 0.8, roughness: 0.3, emissive: 0x0b4f80, emissiveIntensity: 0.6 });
    });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    m.scale.setScalar(2.6 / Math.max(size.x, size.z));
    m.position.y = 1.0;
    m.rotation.y = Math.PI;
    ship.add(m);
    outlineEach(m, 0.02);
  });
  // the clock ring: hours ticking round the ship
  const ring = new THREE.Group();
  ring.position.y = 1.3;
  ring.rotation.x = Math.PI / 2.2;
  g.add(ring);
  ring.add(glowRing(1.9, 0.04, color, 0.9));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 3 ? 0.05 : 0.09, 0.3, 0.05), glowMat(i % 3 ? color : 0xffffff));
    tick.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
    tick.rotation.z = a + Math.PI / 2;
    ring.add(tick);
  }
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 0.04), glowMat(0xffffff));
  hand.geometry.translate(0, 0.75, 0);
  ring.add(hand);
  // the captured singularity, towed behind
  const hole = new THREE.Group();
  hole.position.set(0, 1.25, -1.7);
  g.add(hole);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disk = glowRing(0.62, 0.11, 0x6fd6ff, 0.9);
  disk.rotation.x = Math.PI / 2.3;
  hole.add(disk, glowSprite(0x38bdf8, 2.2));
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), glowMat(color));
  tether.rotation.x = Math.PI / 2;
  tether.position.set(0, 1.25, -1.2);
  g.add(tether);
  const jet = thruster(color, 0.9, 0.16);
  jet.rotation.x = -Math.PI / 2;
  jet.position.set(0, 1.0, -1.25);
  ship.add(jet);
  return {
    group: g,
    animate(t) {
      ring.rotation.z = t * 0.4;
      hand.rotation.z = -t * 2.4;
      disk.rotation.z = t * 3;
      ship.position.y = Math.sin(t * 1.4) * 0.08;
      ship.rotation.z = Math.sin(t * 0.9) * 0.06;
      jet.userData.flicker(t);
    },
  };
}

// a rough sphere of rock with the hot core showing through the cracks
function buildGoliath(color) {
  const g = new THREE.Group();
  const magma = new THREE.Mesh(new THREE.SphereGeometry(1.08, 32, 24), plasmaMaterial('#ffe0a0', '#ff6a00', '#8a1200', 0.12));
  magma.position.y = 1.35;
  g.add(magma);
  const geo = new THREE.IcosahedronGeometry(1.3, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n3 = (x, y, z) => Math.sin(x * 3.1 + Math.sin(y * 2.3)) * Math.cos(z * 2.7 + Math.sin(x * 1.9)) + Math.sin(y * 5.3 + z * 4.1) * 0.35;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = n3(v.x, v.y, v.z);
    // low places sink below the magma: the cracks
    const k = n < -0.55 ? 0.78 : 1 + n * 0.12;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y * 0.9, v.z);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, std(0x5a4636, { metalness: 0.1, roughness: 0.95, flatShading: true }));
  rock.position.y = 1.35;
  g.add(rock);
  // legs: it walks
  const legMat = std(0x3a2c22, { metalness: 0.5, roughness: 0.6 });
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Group();
    leg.position.set(Math.cos(a) * 0.8, 0.55, Math.sin(a) * 0.8);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.7, 8), legMat);
    upper.position.set(Math.cos(a) * 0.25, -0.2, Math.sin(a) * 0.25);
    upper.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 8), legMat);
    foot.position.set(Math.cos(a) * 0.48, -0.52, Math.sin(a) * 0.48);
    leg.add(upper, foot);
    g.add(leg);
    legs.push(leg);
  }
  // planetary defence turrets
  loadModels(['ruler/turret_double']).then(() => {
    for (const [x, z, ry] of [[-0.45, 0.35, 0.3], [0.5, 0.2, -0.4]]) {
      const tur = model('ruler/turret_double');
      if (!tur) return;
      fit(tur, 0.6);
      tur.position.set(x, 2.28, z);
      tur.rotation.y = ry;
      g.add(tur);
    }
  });
  const jets = [];
  for (const s of [-1, 1]) {
    const j = thruster(color, 0.8, 0.2);
    j.position.set(s * 0.95, 1.2, -0.7);
    j.rotation.x = 0.9;
    g.add(j);
    jets.push(j);
  }
  outlineEach(rock, 0.03);
  return {
    group: g,
    animate(t) {
      magma.material.uniforms.uTime.value = t;
      rock.rotation.y = Math.sin(t * 0.3) * 0.1;
      legs.forEach((l, i) => (l.position.y = 0.55 + Math.max(0, Math.sin(t * 2 + i * 1.6)) * 0.06));
      for (const j of jets) j.userData.flicker(t, 0.8);
    },
  };
}

const BUILDERS = { mechanova: buildMecha, kraken: buildKraken, hive: buildHive, stareater: buildStarEater, chronos: buildChronos, goliath: buildGoliath };

// ---------------------------------------------------------------------------
// A flagship: one contender's model on the table, with its pedestal, its label, and its moves.
// ---------------------------------------------------------------------------
const GHOST = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });

export class Flagship {
  constructor(stage, contenderId, color) {
    this.stage = stage;
    this.id = contenderId;
    this.color = new THREE.Color(color);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const built = (BUILDERS[contenderId] || buildHive)(color, stage.camera);
    this.model = built.group;
    this.animateModel = built.animate;
    this.body.add(this.model);
    // the pedestal: a ring of light in the contender's colour
    this.pedestal = glowRing(1.55, 0.05, color, 0.85);
    this.pedestal.rotation.x = Math.PI / 2;
    this.pedestal.position.y = 0.02;
    this.root.add(this.pedestal);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.01;
    this.root.add(this.disc);
    // a shield bubble, flashed when a hit is blocked
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 24), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shield.position.y = 1.35;
    this.root.add(this.shield);
    this.anchor = new THREE.Object3D(); // where labels and lasers come from
    this.anchor.position.y = 2.9;
    this.root.add(this.anchor);
    this.flash = 0;
    this.shieldFlash = 0;
    this.active = false;
    this.ghost = false;
    this.move = null;
    this.facing = null;
    this.bobPhase = Math.random() * 10;
    stage.scene.add(this.root);
    this.unframe = stage.onFrame((dt, t) => this.update(dt, t));
  }

  // where its lasers fire from (in the world)
  muzzle() {
    return this.anchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -1.2, 0));
  }

  centre() {
    return this.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  }

  place(pos) {
    this.root.position.copy(pos);
  }

  // fly to a new spot along an arc, leaving a streak of light
  flyTo(pos, duration = 1.4, height = 4) {
    const from = this.root.position.clone();
    if (from.distanceTo(pos) < 0.01) return;
    this.move = { from, to: pos.clone(), t: 0, duration, height };
  }

  lookAtPoint(p) {
    this.facing = p.clone();
  }

  hit() {
    this.flash = 1;
  }

  block() {
    this.shieldFlash = 1;
  }

  setActive(on) {
    this.active = on;
  }

  setGhost(on) {
    if (on === this.ghost) return;
    this.ghost = on;
    if (on) {
      this.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh || o.isPoints) o.material = GHOST;
        if (o.isSprite) o.visible = false;
      });
      this.pedestal.material.opacity = 0.25;
    }
  }

  update(dt, t) {
    // travel
    if (this.move) {
      const m = this.move;
      m.t += dt / m.duration;
      const k = Math.min(1, m.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.root.position.lerpVectors(m.from, m.to, e);
      this.root.position.y += Math.sin(Math.PI * e) * m.height;
      if (k >= 1) this.move = null;
    }
    // face: towards the middle, turned a little to the camera so you see their faces
    const cam = this.stage.camera.position;
    const goal = this.facing || new THREE.Vector3(0, 0, 0).lerp(new THREE.Vector3(cam.x, 0, cam.z), 0.55);
    const want = Math.atan2(goal.x - this.root.position.x, goal.z - this.root.position.z);
    let diff = want - this.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y += diff * Math.min(1, dt * 3);

    this.body.position.y = 0.25 + Math.sin(t * 1.2 + this.bobPhase) * 0.12;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      this.body.position.x = (Math.random() - 0.5) * this.flash * 0.35;
      this.body.position.z = (Math.random() - 0.5) * this.flash * 0.35;
    } else this.body.position.x = this.body.position.z = 0;
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.8);
    this.shield.material.opacity = this.shieldFlash * 0.35;
    this.shield.scale.setScalar(1 + (1 - this.shieldFlash) * 0.15);

    const pulse = this.active ? 0.95 + Math.sin(t * 5) * 0.05 : 0.55;
    this.pedestal.material.opacity = this.ghost ? 0.2 : pulse;
    this.pedestal.scale.setScalar(this.active ? 1.08 + Math.sin(t * 5) * 0.04 : 1);
    this.pedestal.rotation.z += dt * (this.active ? 1.5 : 0.3);
    this.disc.material.opacity = this.active ? 0.22 : 0.1;
    if (this.ghost) GHOST.opacity = 0.14 + Math.sin(t * 7) * 0.05 + (Math.random() < 0.02 ? 0.2 : 0);
    else this.animateModel(t);
  }

  dispose() {
    this.unframe();
    this.root.removeFromParent();
  }
}

export function preloadShips() {
  return loadModels(['ruler/combatmech', 'characters/anims', 'ruler/craft_speederD', 'ruler/turret_double']);
}
