// Ruler of the Galaxy: the 3D effects. Laser barrages, explosions with shockwaves, stars and Dark Matter
// rising, repair nanites, warp streaks, evolution helixes, and fireworks. Each effect lives for a moment and then
// cleans itself up; they all glow (the stage has bloom).
import * as THREE from 'three';
import { glowTexture } from './galaxy.js';

let DOT = null;
let STAR = null;
const dot = () => (DOT ||= glowTexture(64));
function starTexture() {
  if (STAR) return STAR;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.shadowColor = '#ffd36b';
  g.shadowBlur = 18;
  g.fillStyle = '#fff3c4';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 54;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  STAR = new THREE.CanvasTexture(c);
  STAR.colorSpace = THREE.SRGBColorSpace;
  return STAR;
}
const additive = (o) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });
const UP = new THREE.Vector3(0, 1, 0);
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const SHARD_GEO = new THREE.OctahedronGeometry(0.16);
const DEBRIS_GEO = new THREE.TetrahedronGeometry(0.14);

export class Effects {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.live = [];
    stage.onFrame((dt) => this.update(dt));
  }

  // the soft round glow used by points and sprites (for other files that draw their own particles)
  dotTexture() {
    return dot();
  }

  add(obj, update, after = 0) {
    const fx = { obj, update, t: -after, started: after <= 0 };
    if (fx.started) this.root.add(obj);
    this.live.push(fx);
    return fx;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i];
      fx.t += dt;
      if (fx.t < 0) continue;
      if (!fx.started) {
        fx.started = true;
        this.root.add(fx.obj);
      }
      if (fx.update(fx.t, dt) === false) {
        fx.obj.removeFromParent();
        // (shared geometry and textures stay; a material's dispose leaves its texture alone)
        fx.obj.traverse((o) => {
          if (o.geometry && ![BEAM_GEO, SHARD_GEO, DEBRIS_GEO].includes(o.geometry)) o.geometry.dispose();
          o.material?.dispose?.();
        });
        this.live.splice(i, 1);
      }
    }
  }

  // a glowing bolt from a to b (a laser: one per point of damage, fired in quick succession)
  bolt(a, b, color, delay = 0, width = 0.15) {
    const g = new THREE.Group();
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    const outer = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial(additive({ color, opacity: 0.9 })));
    const inner = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial(additive({ color: 0xffffff, opacity: 1 })));
    for (const m of [outer, inner]) {
      m.position.copy(mid);
      m.quaternion.copy(q);
    }
    outer.scale.set(width * 3, len, width * 3);
    inner.scale.set(width * 0.8, len, width * 0.8);
    const muzzle = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    muzzle.position.copy(a);
    muzzle.scale.setScalar(2.2);
    g.add(outer, inner, muzzle);
    this.add(
      g,
      (t) => {
        const life = 0.5;
        const k = t / life;
        if (k >= 1) return false;
        // it snaps on, then thins away
        const w = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        outer.material.opacity = 0.9 * w;
        inner.material.opacity = w;
        outer.scale.x = outer.scale.z = width * 3 * (0.5 + w);
        muzzle.material.opacity = w;
        return true;
      },
      delay,
    );
    // the hit
    this.burst(b, color, 22, 3.6, delay + 0.05, 0.9, 0.3);
    this.flash(b, color, 3.2, delay + 0.03);
    this.flash(b, 0xffffff, 1.6, delay + 0.03);
  }

  // a quick bright flash
  flash(at, color, size = 2, delay = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    s.position.copy(at);
    this.add(
      s,
      (t) => {
        const k = t / 0.35;
        if (k >= 1) return false;
        s.scale.setScalar(size * (0.6 + k));
        s.material.opacity = 1 - k;
        return true;
      },
      delay,
    );
  }

  // sparks flying out from a point
  burst(at, color, count = 24, speed = 4, delay = 0, life = 0.9, size = 0.22) {
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      vel.push(v);
      pos.set([at.x, at.y, at.z], i * 3);
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(additive({ map: dot(), color, size, sizeAttenuation: true })));
    this.add(
      pts,
      (t, dt) => {
        const k = t / life;
        if (k >= 1) return false;
        for (let i = 0; i < count; i++) {
          vel[i].multiplyScalar(Math.pow(0.15, dt));
          pos[i * 3] += vel[i].x * dt;
          pos[i * 3 + 1] += vel[i].y * dt;
          pos[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        pts.material.opacity = 1 - k;
        return true;
      },
      delay,
    );
  }

  // an expanding ring of light
  shockwave(at, color, size = 6, delay = 0, life = 0.9) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 64), new THREE.MeshBasicMaterial(additive({ color })));
    ring.position.copy(at);
    ring.rotation.x = Math.PI / 2;
    this.add(
      ring,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const e = 1 - Math.pow(1 - k, 3);
        ring.scale.setScalar(0.3 + e * size);
        ring.material.opacity = 1 - k;
        return true;
      },
      delay,
    );
  }

  // a ship blows up
  explosion(at, color) {
    this.flash(at, 0xffffff, 7);
    this.flash(at, color, 10, 0.05);
    this.burst(at, 0xffb347, 70, 9, 0, 1.4, 0.4);
    this.burst(at, color, 50, 6, 0.08, 1.6, 0.3);
    this.shockwave(at, color, 12, 0);
    this.shockwave(at, 0xffffff, 8, 0.12);
    // debris tumbling away
    const g = new THREE.Group();
    const bits = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(DEBRIS_GEO, new THREE.MeshStandardMaterial({ color: i % 3 ? 0x4a4a5a : color, emissive: i % 3 ? 0x000000 : color, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.4 }));
      m.position.copy(at);
      m.userData.v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 6);
      m.userData.r = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      g.add(m);
      bits.push(m);
    }
    this.add(g, (t, dt) => {
      if (t > 2.2) return false;
      for (const b of bits) {
        b.position.addScaledVector(b.userData.v, dt);
        b.userData.v.multiplyScalar(Math.pow(0.4, dt));
        b.rotation.x += b.userData.r.x * dt;
        b.rotation.y += b.userData.r.y * dt;
        b.scale.setScalar(Math.max(0.01, 1 - t / 2.2));
      }
      return true;
    });
  }

  // Dominion Stars rise from a ship
  stars(at, n, delay = 0) {
    for (let i = 0; i < Math.min(n, 8); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: starTexture(), color: 0xffd36b })));
      const start = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2));
      s.position.copy(start);
      const drift = new THREE.Vector3((Math.random() - 0.5) * 1.6, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6);
      this.add(
        s,
        (t) => {
          const k = t / 1.6;
          if (k >= 1) return false;
          const e = 1 - Math.pow(1 - k, 2);
          s.position.copy(start).addScaledVector(drift, e);
          s.scale.setScalar(0.4 + Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.9);
          s.material.rotation = t * 3;
          s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          return true;
        },
        delay + i * 0.09,
      );
    }
  }

  // Dark Matter crystals spiral into a ship
  shards(at, n, delay = 0) {
    for (let i = 0; i < Math.min(n, 9); i++) {
      const m = new THREE.Mesh(SHARD_GEO, new THREE.MeshBasicMaterial({ color: 0xc36bff }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color: 0xb537f2 })));
      halo.scale.setScalar(0.7);
      const g = new THREE.Group();
      g.add(m, halo);
      const a0 = (i / Math.max(1, n)) * Math.PI * 2;
      this.add(
        g,
        (t) => {
          const k = t / 1.3;
          if (k >= 1) return false;
          const r = 2.6 * (1 - k);
          const a = a0 + k * 6;
          g.position.set(at.x + Math.cos(a) * r, at.y + 1.5 * (1 - k) + 0.2, at.z + Math.sin(a) * r);
          m.rotation.y = t * 8;
          g.scale.setScalar(k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15);
          return true;
        },
        delay + i * 0.07,
      );
    }
    this.flash(at, 0xb537f2, 2.2, delay + 1.2);
  }

  // green repair nanites swirl up round a ship
  repair(at, n, delay = 0) {
    const count = 30 + n * 10;
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(additive({ map: dot(), color: 0x00ff87, size: 0.28 })));
    const ph = Array.from({ length: count }, () => [Math.random() * Math.PI * 2, Math.random()]);
    this.add(
      pts,
      (t) => {
        const k = t / 1.6;
        if (k >= 1) return false;
        for (let i = 0; i < count; i++) {
          const [a, h] = ph[i];
          const r = 1.5 - h * 0.6;
          const y = ((h + k * 1.5) % 1) * 3.2;
          pos.set([at.x + Math.cos(a + t * 3) * r, at.y - 0.8 + y, at.z + Math.sin(a + t * 3) * r], i * 3);
        }
        geo.attributes.position.needsUpdate = true;
        pts.material.opacity = Math.sin(Math.PI * k);
        return true;
      },
      delay,
    );
  }

  // two strands of light twist round a ship: it evolved
  helix(at, color) {
    const count = 120;
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(additive({ map: dot(), color, size: 0.3 })));
    this.add(pts, (t) => {
      const k = t / 2.4;
      if (k >= 1) return false;
      for (let i = 0; i < count; i++) {
        const strand = i % 2;
        const u = i / count;
        const a = u * Math.PI * 6 + t * 4 + strand * Math.PI;
        const r = 1.7 * (1 - k * 0.4);
        pos.set([at.x + Math.cos(a) * r, at.y - 1 + u * 4.5 * Math.min(1, k * 3), at.z + Math.sin(a) * r], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      return true;
    });
    this.shockwave(at, color, 5, 0.6);
    this.flash(at, color, 6, 0.6);
  }

  // a streak behind something moving fast (called each frame while it flies)
  trail(at, color) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    s.position.copy(at);
    this.add(s, (t) => {
      const k = t / 0.5;
      if (k >= 1) return false;
      s.scale.setScalar(1.4 * (1 - k));
      s.material.opacity = 0.8 * (1 - k);
      return true;
    });
  }

  // a ghost's wisp drifting from one place to another
  wisp(a, b, delay = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color: 0x9fe8ff })));
    s.scale.setScalar(1.2);
    this.add(
      s,
      (t) => {
        const k = t / 1.2;
        if (k >= 1) return false;
        s.position.lerpVectors(a, b, k);
        s.position.y += Math.sin(Math.PI * k) * 3 + Math.sin(t * 12) * 0.2;
        s.material.opacity = Math.sin(Math.PI * k);
        return true;
      },
      delay,
    );
  }

  // fireworks over the winner
  fireworks(at, colors) {
    for (let i = 0; i < 9; i++) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 5, (Math.random() - 0.5) * 10));
      const c = colors[i % colors.length];
      this.burst(p, c, 60, 6, i * 0.35, 1.6, 0.35);
      this.flash(p, c, 4, i * 0.35);
    }
  }

  // ---------------------------------------------------------------------------
  // The newer effects (see moves.js, which uses them for attacks and entrances)
  // ---------------------------------------------------------------------------

  // a thick beam that holds, pulsing, then fades: the Star-Eater's solar lance
  beam(a, b, color, { life = 0.9, width = 0.5, delay = 0, pulse = 14 } = {}) {
    const g = new THREE.Group();
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    const layers = [
      [width * 2.8, color, 0.3],
      [width * 1.4, color, 0.7],
      [width * 0.55, 0xffffff, 1],
    ];
    const meshes = layers.map(([w, c, o]) => {
      const m = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial(additive({ color: c, opacity: o })));
      m.position.copy(mid);
      m.quaternion.copy(q);
      m.scale.set(w, len, w);
      g.add(m);
      return m;
    });
    const head = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: starTexture(), color })));
    head.position.copy(a);
    const tail = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    tail.position.copy(b);
    g.add(head, tail);
    this.add(
      g,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const env = k < 0.12 ? k / 0.12 : k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
        const wob = 1 + Math.sin(t * pulse) * 0.14;
        meshes.forEach((m, i) => {
          m.scale.x = m.scale.z = layers[i][0] * wob * (0.35 + 0.65 * env);
          m.material.opacity = layers[i][2] * env;
        });
        head.scale.setScalar(width * 9 * (0.6 + 0.4 * env) * wob);
        head.material.rotation = t * 4;
        head.material.opacity = env;
        tail.scale.setScalar(width * 12 * (0.7 + 0.3 * env) * wob);
        tail.material.opacity = env;
        return true;
      },
      delay,
    );
  }

  // a glowing tendril that whips out along these points and snaps back (the Kraken's lash)
  tube(points, color, radius = 0.13, life = 0.75, delay = 0) {
    const curve = new THREE.CatmullRomCurve3(points);
    const radial = 6;
    const geo = new THREE.TubeGeometry(curve, 32, radius, radial, false);
    const per = radial * 6;
    const segments = Math.floor(geo.index.count / per);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(additive({ color, opacity: 0.95 })));
    const geo2 = new THREE.TubeGeometry(curve, 32, radius * 0.4, radial, false);
    const white = new THREE.Mesh(geo2, new THREE.MeshBasicMaterial(additive({ color: 0xffffff, opacity: 0.9 })));
    const g = new THREE.Group();
    g.add(core, white);
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    this.add(
      g,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const end = Math.floor(segments * ease(k / 0.4));
        const start = k > 0.6 ? Math.floor(segments * ease((k - 0.6) / 0.4)) : 0;
        for (const m of [core, white]) m.geometry.setDrawRange(start * per, Math.max(0, end - start) * per);
        const fade = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
        core.material.opacity = 0.95 * fade;
        white.material.opacity = 0.9 * fade;
        return true;
      },
      delay,
    );
  }

  // soft grey smoke puffing up and spreading (after an explosion or a landing)
  smoke(at, count = 10, color = 0x3a3a4a, life = 1.8, spread = 1.6, delay = 0) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color, transparent: true, opacity: 0.5, depthWrite: false }));
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * spread);
      const start = at.clone();
      this.add(
        s,
        (t) => {
          const k = t / life;
          if (k >= 1) return false;
          s.position.copy(start).addScaledVector(v, 1 - Math.pow(1 - k, 2));
          s.scale.setScalar(0.8 + k * 3.2);
          s.material.opacity = 0.5 * (1 - k);
          return true;
        },
        delay + Math.random() * 0.2,
      );
    }
  }

  // dust thrown out along the ground (a landing)
  dust(at, size = 5, delay = 0) {
    const count = 26;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: 0x8a7a6a, transparent: true, opacity: 0.45, depthWrite: false }));
      const start = at.clone();
      const reach = size * (0.55 + Math.random() * 0.45);
      this.add(
        s,
        (t) => {
          const k = t / 1.3;
          if (k >= 1) return false;
          const e = 1 - Math.pow(1 - k, 2.5);
          s.position.set(start.x + Math.cos(a) * reach * e, start.y + 0.25 + k * 0.6, start.z + Math.sin(a) * reach * e);
          s.scale.setScalar(1 + k * 2.6);
          s.material.opacity = 0.45 * (1 - k);
          return true;
        },
        delay,
      );
    }
  }

  // particles rush in from a sphere and gather at a point (a weapon charging, a swarm forming)
  converge(at, color, { count = 40, radius = 3, life = 0.5, delay = 0, size = 0.24 } = {}) {
    const pos = new Float32Array(count * 3);
    const dirs = Array.from({ length: count }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius * (0.6 + Math.random() * 0.4)));
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(additive({ map: dot(), color, size, sizeAttenuation: true })));
    this.add(
      pts,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const e = k * k; // they accelerate towards the middle
        for (let i = 0; i < count; i++) {
          const d = dirs[i];
          pos.set([at.x + d.x * (1 - e), at.y + d.y * (1 - e), at.z + d.z * (1 - e)], i * 3);
        }
        geo.attributes.position.needsUpdate = true;
        pts.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
        return true;
      },
      delay,
    );
  }

  // an orb of light swelling at a point (a weapon charging up)
  chargeOrb(at, color, life = 0.45, size = 2.4, delay = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    const core = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color: 0xffffff })));
    s.position.copy(at);
    core.position.copy(at);
    const g = new THREE.Group();
    g.add(s, core);
    this.add(
      g,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const grow = 0.15 + k * k;
        s.scale.setScalar(size * grow * (1 + Math.sin(t * 40) * 0.05));
        core.scale.setScalar(size * grow * 0.45);
        s.material.opacity = k < 0.85 ? 0.9 : 1 - (k - 0.85) / 0.15;
        core.material.opacity = s.material.opacity;
        return true;
      },
      delay,
    );
  }

  // a ring facing a direction, growing as it goes (it can also travel: `to`)
  ringFacing(at, dir, color, from = 0.4, to = 2.4, life = 0.4, delay = 0, travelTo = null) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 48), new THREE.MeshBasicMaterial(additive({ color })));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    ring.position.copy(at);
    const start = at.clone();
    this.add(
      ring,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        if (travelTo) ring.position.lerpVectors(start, travelTo, k);
        ring.scale.setScalar(from + (to - from) * Math.pow(k, 0.7));
        ring.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        return true;
      },
      delay,
    );
  }

  // a clock face spinning open and fading: the Chronos Syndicate's hit
  clockFlash(at, color, delay = 0) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48), new THREE.MeshBasicMaterial(additive({ color })));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const ticks = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, i % 3 ? 0.22 : 0.4), new THREE.MeshBasicMaterial(additive({ color: 0xffffff })));
      const a = (i / 12) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86);
      m.rotation.y = -a;
      ticks.add(m);
    }
    g.add(ticks);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), new THREE.MeshBasicMaterial(additive({ color: 0xffffff })));
    hand.position.z = 0.4;
    const handG = new THREE.Group();
    handG.add(hand);
    g.add(handG);
    g.position.copy(at);
    this.add(
      g,
      (t) => {
        const k = t / 0.8;
        if (k >= 1) return false;
        const e = 1 - Math.pow(1 - k, 3);
        g.scale.setScalar(0.5 + e * 2.8);
        ticks.rotation.y = -t * 6;
        handG.rotation.y = t * 22;
        const o = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        for (const m of [ring, ...ticks.children, hand]) m.material.opacity = o;
        return true;
      },
      delay,
    );
  }

  // chunks of rock or metal thrown out and falling back (they bounce on the ground plane)
  chunks(at, color, count = 14, speed = 6, size = 0.3, life = 1.8, delay = 0) {
    const g = new THREE.Group();
    const bits = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size * (0.5 + Math.random()), 0), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4a3f3a : color, emissive: i % 3 ? 0x000000 : color, emissiveIntensity: 1.2, roughness: 0.7 }));
      m.position.copy(at);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * speed, 3 + Math.random() * speed, (Math.random() - 0.5) * speed);
      m.userData.r = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      g.add(m);
      bits.push(m);
    }
    this.add(
      g,
      (t, dt) => {
        if (t > life) {
          for (const b of bits) b.geometry.dispose();
          return false;
        }
        for (const b of bits) {
          b.userData.v.y -= 14 * dt;
          b.position.addScaledVector(b.userData.v, dt);
          if (b.position.y < at.y - 0.4) {
            b.position.y = at.y - 0.4;
            b.userData.v.y *= -0.35;
            b.userData.v.x *= 0.7;
            b.userData.v.z *= 0.7;
          }
          b.rotation.x += b.userData.r.x * dt;
          b.rotation.y += b.userData.r.y * dt;
          b.scale.setScalar(t > life * 0.7 ? Math.max(0.01, 1 - (t - life * 0.7) / (life * 0.3)) : 1);
        }
        return true;
      },
      delay,
    );
  }

  // a glowing scar on the ground that cools and fades (a crater)
  crater(at, color, size = 2.4, life = 3.2, delay = 0) {
    const m = new THREE.Mesh(new THREE.RingGeometry(size * 0.35, size, 40), new THREE.MeshBasicMaterial(additive({ color, opacity: 0.8, side: THREE.DoubleSide })));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at).setY(at.y - 0.3);
    this.add(
      m,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        m.scale.setScalar(1 + Math.min(1, k * 4) * 0.3);
        m.material.opacity = 0.8 * (1 - k) * (1 - k);
        return true;
      },
      delay,
    );
  }

  // a thin bright streak between two points that lingers a moment (a warp jump)
  streak(a, b, color, life = 0.55, width = 0.22, delay = 0) {
    this.beam(a, b, color, { life, width, delay, pulse: 0 });
  }

  // a ball of fire flying along a straight line with a long tail (a meteor)
  fireball(from, to, color, life = 0.9, size = 2.4, delay = 0) {
    const head = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color: 0xfff1c4 })));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: dot(), color })));
    const g = new THREE.Group();
    g.add(glow, head);
    const dir = to.clone().sub(from);
    const tailLen = 14;
    const tail = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial(additive({ color, opacity: 0.6 })));
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    tail.quaternion.copy(q);
    g.add(tail);
    this.add(
      g,
      (t) => {
        const k = t / life;
        if (k >= 1) return false;
        const e = k * k;
        const p = from.clone().lerp(to, e);
        head.position.copy(p);
        glow.position.copy(p);
        head.scale.setScalar(size * 0.8);
        glow.scale.setScalar(size * (1.6 + Math.sin(t * 50) * 0.15));
        const len = tailLen * (0.4 + e);
        tail.position.copy(p).addScaledVector(dir.clone().normalize(), -len / 2);
        tail.scale.set(size * 0.9, len, size * 0.9);
        tail.material.opacity = 0.6;
        return true;
      },
      delay,
    );
  }
}
