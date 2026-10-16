// Star Bonanza: the 3D stars. Each kind is a boiling plasma ball with a glow, and its own extras: a pulsar sweeps
// two beams round like a lighthouse, a neutron star shoots a thin jet each way, a quasar fires jets from a
// tilted disc of gas, a magnetar spins loops of magnetic field, a red giant swells and a white dwarf glints.
// makeStar(id) gives a group with an update(t) to call every frame; tickStars(t) keeps the plasma moving.
import * as THREE from 'three';
import { plasmaMaterial } from '../../ruler/scene/arena.js';
import { glowTexture } from '../../ruler/scene/galaxy.js';
import { star } from '../net.js';

// how big each kind looks (its core, in world units) and how far its glow reaches
const RADIUS = { 'red-dwarf': 0.36, 'brown-dwarf': 0.32, 'orange-dwarf': 0.4, 'yellow-dwarf': 0.44, 'white-dwarf': 0.25, 'blue-giant': 0.58, 'red-giant': 0.74, 'neutron-star': 0.17, pulsar: 0.2, quasar: 0.32, magnetar: 0.22 };
const GLOW = { 'red-dwarf': 4.2, 'brown-dwarf': 3.4, 'orange-dwarf': 4.2, 'yellow-dwarf': 4.4, 'white-dwarf': 8, 'blue-giant': 5.2, 'red-giant': 3.8, 'neutron-star': 11, pulsar: 11, quasar: 7, magnetar: 10 };
export const radiusOf = (id) => RADIUS[id] ?? 0.22;

let DOT = null;
const dot = () => (DOT ||= glowTexture(64));
let SPIKE = null;
// a four-pointed glint, for the white dwarf
function spike() {
  if (SPIKE) return SPIKE;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (const a of [0, Math.PI / 2]) {
    g.save();
    g.rotate(a);
    const grad = g.createLinearGradient(-64, 0, 64, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-64, 0);
    g.lineTo(0, -2.5);
    g.lineTo(64, 0);
    g.lineTo(0, 2.5);
    g.closePath();
    g.fill();
    g.restore();
  }
  SPIKE = new THREE.CanvasTexture(c);
  SPIKE.colorSpace = THREE.SRGBColorSpace;
  return SPIKE;
}

const SPHERE = new THREE.SphereGeometry(1, 28, 20);
const additive = (o) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });

// one plasma surface per kind, shared by every star of that kind (so one clock moves them all)
const surfaces = new Map();
function surface(def) {
  let m = surfaces.get(def.id);
  if (!m) {
    const hot = new THREE.Color(def.color).lerp(new THREE.Color('#ffffff'), 0.65);
    const cool = new THREE.Color(def.glow).multiplyScalar(0.55);
    m = plasmaMaterial(`#${hot.getHexString()}`, def.color, `#${cool.getHexString()}`, def.id === 'neutron-star' || def.id === 'pulsar' ? 0.5 : 0.22);
    if (def.id === 'brown-dwarf') m.uniforms.uBoost.value = -1.6; // a dim ember
    if (def.id === 'white-dwarf' || def.id === 'quasar') m.uniforms.uBoost.value = 2;
    surfaces.set(def.id, m);
  }
  return m;
}
export function tickStars(t) {
  for (const m of surfaces.values()) m.uniforms.uTime.value = t;
}

const mats = new Map();
const glowMat = (color, opacity = 0.9) => {
  const key = `g${color}${opacity}`;
  if (!mats.has(key)) mats.set(key, new THREE.SpriteMaterial({ map: dot(), color, ...additive({ opacity }) }));
  return mats.get(key);
};
const flat = (color, opacity) => {
  const key = `f${color}${opacity}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color, ...additive({ opacity, side: THREE.DoubleSide }) }));
  return mats.get(key);
};

// a long thin cone with its point at the origin, pointing along -y
const beamGeo = (radius, length) => {
  const g = new THREE.ConeGeometry(radius, length, 14, 1, true);
  g.translate(0, -length / 2, 0);
  return g;
};

// what each kind adds to the plain glowing ball: (group, core radius, definition, animation list)
const EXTRAS = {
  pulsar(g, r, d, anim) {
    const pivot = new THREE.Group();
    pivot.rotation.z = 0.7;
    const geo = beamGeo(r * 0.5, r * 9);
    for (const flip of [0, Math.PI]) {
      const b = new THREE.Mesh(geo, flat('#d9a8ff', 0.32));
      b.rotation.z = flip;
      pivot.add(b);
    }
    g.add(pivot);
    anim.push((t) => (pivot.rotation.y = t * 3.2));
  },
  'neutron-star'(g, r, d, anim) {
    const pivot = new THREE.Group();
    pivot.rotation.z = 0.35;
    const geo = beamGeo(r * 0.16, r * 11);
    for (const flip of [0, Math.PI]) {
      const b = new THREE.Mesh(geo, flat('#9ff0ff', 0.5));
      b.rotation.z = flip;
      pivot.add(b);
    }
    g.add(pivot);
    anim.push((t) => (pivot.rotation.y = t * 1.6));
  },
  quasar(g, r, d, anim) {
    const jets = new THREE.Group();
    for (const flip of [0, Math.PI]) {
      const b = new THREE.Mesh(beamGeo(r * 0.28, r * 8), flat('#bff2ff', 0.38));
      b.rotation.z = flip;
      jets.add(b);
    }
    g.add(jets);
    const disk = new THREE.Group();
    disk.rotation.x = 1.25;
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (1.7 + k * 0.55), 0.016 + (3 - k) * 0.004, 6, 56), flat(k % 2 ? '#bff2ff' : '#ffffff', 0.55 - k * 0.08));
      disk.add(ring);
    }
    g.add(disk);
    anim.push((t) => {
      disk.rotation.z = t * 0.9;
      jets.rotation.y = t * 0.4;
    });
  },
  magnetar(g, r, d, anim) {
    const field = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(r * 2, 0.012, 6, 36, Math.PI), flat('#ff5fb0', 0.5));
      loop.rotation.y = (k * Math.PI) / 4;
      loop.rotation.z = Math.PI / 2;
      field.add(loop);
      const mirror = loop.clone();
      mirror.rotation.z = -Math.PI / 2;
      field.add(mirror);
    }
    g.add(field);
    anim.push((t) => (field.rotation.y = t * 0.7));
  },
  'red-giant'(g, r, d, anim) {
    const shell = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: d.glow, ...additive({ opacity: 0.22, side: THREE.BackSide }) }));
    shell.scale.setScalar(r * 1.3);
    g.add(shell);
    anim.push((t) => {
      const s = r * (1.28 + Math.sin(t * 1.3) * 0.05);
      shell.scale.setScalar(s);
    });
  },
  'blue-giant'(g, r, d, anim) {
    const halo = new THREE.Sprite(glowMat('#8ec5ff', 0.4));
    halo.scale.setScalar(r * 16);
    g.add(halo);
    anim.push((t) => halo.scale.setScalar(r * (15 + Math.sin(t * 2.1) * 1.2)));
  },
  'white-dwarf'(g, r, d, anim) {
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: spike(), ...additive({ opacity: 0.85 }) }));
    glint.scale.setScalar(r * 15);
    g.add(glint);
    anim.push((t) => {
      glint.material.rotation = t * 0.25;
    });
  },
  'brown-dwarf'(g, r, d, anim) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.9, 0.01, 6, 40), flat('#c060d0', 0.35));
    ring.rotation.x = 1.2;
    g.add(ring);
    anim.push((t) => (ring.rotation.z = t * 0.3));
  },
  'yellow-dwarf'(g, r, d, anim) {
    const corona = new THREE.Sprite(glowMat('#ff9a1a', 0.35));
    corona.scale.setScalar(r * 9);
    g.add(corona);
    anim.push((t) => corona.scale.setScalar(r * (9 + Math.sin(t * 1.7) * 0.5)));
  },
};

export function makeStar(id) {
  const d = star(id);
  const r = radiusOf(id);
  const g = new THREE.Group();
  const core = new THREE.Mesh(SPHERE, surface(d));
  core.scale.setScalar(r);
  g.add(core);
  const glow = new THREE.Sprite(glowMat(d.glow, 0.9));
  glow.scale.setScalar(r * (GLOW[id] ?? 6));
  g.add(glow);
  const anim = [];
  EXTRAS[id]?.(g, r, d, anim);
  const phase = Math.random() * 6;
  core.rotation.y = phase;
  g.userData = {
    id,
    radius: r,
    update(t) {
      core.rotation.y = t * 0.2 + phase;
      for (const f of anim) f(t + phase);
    },
  };
  return g;
}

// a lumen: a little gold disc, stacked in a pile beside its owner
const COIN = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 24);
const COIN_MAT = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xffa400, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
export function makeCoin() {
  return new THREE.Mesh(COIN, COIN_MAT);
}
