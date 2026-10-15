// 🚀 Space around the classic station, with real models from Kenney's Space Kit (CC0, kenney.nl). Some are shared with
// Ruler of the Galaxy (assets/models/ruler: its turret, speeder, rocks and meteors): a cargo ship and a racer docked at
// two corners of the station, a turret on each far corner, two patrol ships flying slow circles, and a ring of rocks and
// meteors drifting round the whole thing. Only the space station (Black Hole Blues) gets them, and they are all
// scenery: the models load the first time the station is shown, and until then (or if they fail) space is just space.
import * as THREE from 'three';
import { loadModels, model } from './assets.js';

const ROCKS = ['ruler/rock_largeA', 'ruler/rock_largeB', 'ruler/meteor', 'ruler/meteor_detailed', 'ruler/rocks_smallA'];
const NAMES = [...ROCKS, 'ruler/turret_double', 'ruler/craft_speederD', 'spacekit/craft_cargoA', 'spacekit/craft_racer', 'spacekit/craft_speederA'];

// A model standing on y = 0 with its footprint centred, scaled so its longest side is `size` (the Space Kit models sit
// off to one side of their own origin, and come in all sizes)
function fit(id, size) {
  const m = model(id);
  if (!m) return null;
  const g = new THREE.Group();
  g.add(m);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  m.position.set(-c.x, -box.min.y, -c.z);
  g.scale.setScalar(size / Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
  return g;
}

// the same "random" every time, so the rocks sit in the same places for everyone
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ClassicExterior {
  constructor(ship, { lowFx = false } = {}) {
    this.lowFx = lowFx;
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.dressed = false;
    this.ready = Promise.resolve(); // settles when the models are in
    this.rocks = [];
    this.patrol = [];
  }

  setActive(on) {
    this.group.visible = on;
    if (on && !this.dressed) this.ready = this.dress();
  }

  async dress() {
    this.dressed = true;
    await loadModels(NAMES);
    const g = this.group;
    const put = (obj, x, y, z, ry = 0) => {
      if (!obj) return null;
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      g.add(obj);
      return obj;
    };

    // ---------- two ships docked at the corners (the middle belongs to the solar wings) ----------
    put(fit('spacekit/craft_cargoA', 7), 45.5, -1.1, 22, Math.PI / 2);
    put(fit('spacekit/craft_racer', 6), -45.5, -1.1, -22, -Math.PI / 2);

    // ---------- a turret on each far corner, on a short pylon ----------
    const pylon = new THREE.MeshStandardMaterial({ color: 0x3b4468, roughness: 0.6, metalness: 0.6 });
    for (const [x, z] of [[-37.5, -33.5], [37.5, -33.5], [-37.5, 33.5], [37.5, 33.5]]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 3, 10), pylon);
      base.position.set(x, -2.6, z);
      g.add(base);
      put(fit('ruler/turret_double', 4), x, -1.1, z, Math.atan2(x, z));
    }

    // ---------- two patrol ships on slow circles ----------
    const speeders = [['spacekit/craft_speederA', 5.5, 62, 9, 0.045, 0.6], ['ruler/craft_speederD', 5.5, 80, 15, -0.035, 3.4]];
    for (const [id, size, radius, y, speed, angle] of speeders) {
      const obj = fit(id, size);
      if (!obj) continue;
      const pivot = new THREE.Group(); // the pivot keeps the ship level while the model banks inside it
      pivot.add(obj);
      g.add(pivot);
      this.patrol.push({ pivot, obj, radius, y, speed, angle });
    }

    // ---------- the ring of rocks and meteors ----------
    const rnd = seeded(2051);
    const count = this.lowFx ? 10 : 30;
    for (let i = 0; i < count; i++) {
      const obj = fit(ROCKS[Math.floor(rnd() * ROCKS.length)], 2.4 + rnd() * 6.5);
      if (!obj) continue;
      const rock = { obj, radius: 66 + rnd() * 50, y: -26 + rnd() * 50, angle: rnd() * Math.PI * 2, speed: (0.004 + rnd() * 0.01) * (rnd() < 0.8 ? 1 : -1), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.5), bob: 0.2 + rnd() * 0.4, phase: rnd() * 6 };
      obj.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      g.add(obj);
      this.rocks.push(rock);
    }
    this.update(0, 0);
  }

  update(t, dt) {
    if (!this.group.visible || !this.dressed) return;
    for (const r of this.rocks) {
      r.angle += r.speed * dt;
      r.obj.position.set(Math.cos(r.angle) * r.radius, r.y + Math.sin(t * r.bob + r.phase) * 0.8, Math.sin(r.angle) * r.radius);
      r.obj.rotation.x += r.spin.x * dt;
      r.obj.rotation.y += r.spin.y * dt;
      r.obj.rotation.z += r.spin.z * dt;
    }
    for (const p of this.patrol) {
      p.angle += p.speed * dt;
      p.pivot.position.set(Math.cos(p.angle) * p.radius, p.y + Math.sin(t * 0.4 + p.radius) * 0.7, Math.sin(p.angle) * p.radius);
      const dir = Math.sign(p.speed);
      p.pivot.rotation.y = Math.atan2(-Math.sin(p.angle) * dir, Math.cos(p.angle) * dir);
      p.obj.rotation.z = Math.sin(t * 0.5 + p.radius) * 0.12; // a gentle bank
    }
  }
}
