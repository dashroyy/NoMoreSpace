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
}
