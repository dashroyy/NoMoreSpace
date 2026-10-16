// Star Bonanza: cartoon effects. Puffs of smoke, confetti, pop-up sparkles, rings that spread across the ground,
// and a sparkle trail behind anything flying. No glow anywhere: everything is solid, bouncy and a bit silly.
import * as THREE from 'three';
import { toon } from './stage.js';
import { sparkleTexture } from './sky.js';

const BALL = new THREE.SphereGeometry(1, 14, 10);
const BIT = new THREE.PlaneGeometry(0.2, 0.3);
const RING = new THREE.RingGeometry(0.86, 1, 48);
const CONFETTI = ['#ff5d8f', '#ffd23f', '#4dc3ff', '#53e0b0', '#a66bff', '#ff9a3c'].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pop = (k) => (k < 0.25 ? (k / 0.25) * 1.25 : 1.25 - Math.min(1, (k - 0.25) / 0.3) * 0.25);

export class ToonFx {
  constructor(stage) {
    this.stage = stage;
    this.items = [];
    this.sparkle = sparkleTexture();
    stage.onFrame((dt) => this.update(dt));
  }

  add(obj, life, step) {
    this.stage.scene.add(obj);
    this.items.push({ obj, life, step, t: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t < 0) continue;
      it.obj.visible = true;
      const k = Math.min(1, it.t / it.life);
      it.step(k, dt);
      if (k >= 1) {
        it.obj.removeFromParent();
        if (it.obj.material && !it.obj.material.userData.shared) it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  // round cartoon puffs of smoke that swell and fade
  puff(at, color = '#ffffff', n = 7, size = 0.5, delay = 0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(BALL, toon(color, { transparent: true, opacity: 0.95 }));
      const dir = v(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize();
      const s = size * (0.6 + Math.random() * 0.6);
      m.position.copy(at);
      m.visible = false;
      this.add(m, 0.7 + Math.random() * 0.3, (k) => {
        m.position.copy(at).addScaledVector(dir, (1 - Math.pow(1 - k, 3)) * size * 2.6);
        m.scale.setScalar(s * (0.4 + k * 1.1));
        m.material.opacity = 0.95 * (1 - k * k);
      });
      this.items[this.items.length - 1].t = -delay;
    }
  }

  // a shower of paper confetti
  confetti(at, n = 30, power = 1, delay = 0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(BIT, CONFETTI[i % CONFETTI.length]);
      m.material.userData.shared = true;
      const vel = v((Math.random() - 0.5) * 7, 6 + Math.random() * 6, (Math.random() - 0.5) * 7).multiplyScalar(power);
      const spin = v(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      m.position.copy(at);
      m.visible = false;
      this.add(m, 1.8 + Math.random() * 0.6, (k, dt) => {
        vel.y -= 14 * dt;
        vel.multiplyScalar(1 - dt * 1.2);
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.rotation.z += spin.z * dt;
        m.scale.setScalar(k > 0.8 ? (1 - k) / 0.2 : 1);
      });
      this.items[this.items.length - 1].t = -delay;
    }
  }

  // twinkles that pop out and shrink away
  sparkles(at, n = 6, color = '#fff1a8', spread = 1.4, delay = 0, size = 0.9) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color, transparent: true, depthWrite: false }));
      const to = at.clone().add(v((Math.random() - 0.5) * spread * 2, Math.random() * spread * 1.3, (Math.random() - 0.5) * spread * 2));
      const s = size * (0.5 + Math.random() * 0.8);
      m.position.copy(at);
      m.visible = false;
      this.add(m, 0.6 + Math.random() * 0.3, (k) => {
        m.position.lerpVectors(at, to, 1 - Math.pow(1 - k, 3));
        m.scale.setScalar(s * pop(k) * (1 - k * 0.6));
        m.material.rotation = k * 2;
        m.material.opacity = 1 - k * k;
      });
      this.items[this.items.length - 1].t = -delay - i * 0.03;
    }
  }

  // one big twinkle (where a star lands, say)
  flash(at, color = '#ffffff', size = 2, delay = 0) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color, transparent: true, depthWrite: false }));
    m.position.copy(at);
    m.visible = false;
    this.add(m, 0.45, (k) => {
      m.scale.setScalar(size * pop(k) * (1 - k * 0.5));
      m.material.rotation = k * 1.5;
      m.material.opacity = 1 - k;
    });
    this.items[this.items.length - 1].t = -delay;
  }

  // a ring spreading over the ground
  ring(at, color = '#ffffff', size = 3, life = 0.6, delay = 0) {
    const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at);
    m.visible = false;
    this.add(m, life, (k) => {
      m.scale.setScalar(0.2 + (1 - Math.pow(1 - k, 3)) * size);
      m.material.opacity = 1 - k;
    });
    this.items[this.items.length - 1].t = -delay;
  }

  // the little sparkle left behind anything flying
  trail(at, color = '#ffffff') {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color, transparent: true, depthWrite: false }));
    m.position.copy(at).add(v((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    const s = 0.35 + Math.random() * 0.3;
    this.add(m, 0.45, (k) => {
      m.scale.setScalar(s * (1 - k));
      m.material.opacity = 1 - k;
    });
  }

  // a big party: confetti, sparkles and puffs of colour
  party(at) {
    this.confetti(at, 60, 1.2);
    this.confetti(at.clone().add(v(2, 1, 0)), 40, 1, 0.35);
    this.sparkles(at, 14, '#fff1a8', 3, 0, 1.6);
    this.sparkles(at, 10, '#ffc2e5', 3, 0.3, 1.4);
    this.puff(at, '#ffd23f', 6, 0.8, 0.1);
  }
}
