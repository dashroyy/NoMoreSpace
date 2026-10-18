// Star Charters: celebrations in 3D. Sparks and confetti when something is finished, a ring of dust when a tile
// lands, a beam of light from an array that calibrates, a little ship that zooms down a finished lane, and a flash
// of light along a wormhole bridge.
import * as THREE from 'three';
import { glowTexture, TOP } from './look.js';

export class Effects {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.items = [];
    this.light = false; // fewer particles (a phone, or a lot going on)
    stage.onFrame((dt) => this.update(dt));
  }

  add(obj, life, fn) {
    this.root.add(obj);
    this.items.push({ obj, life, t: 0, fn });
  }

  sprite(colour, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(size);
    return s;
  }

  // sparks flying out of a point
  sparks(at, colour = '#ffd34d', n = 26) {
    n = this.light ? Math.ceil(n / 2) : n;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(colour, 0.18 + Math.random() * 0.16);
      s.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 5);
      this.add(s, 0.9 + Math.random() * 0.5, (k, dt) => {
        v.y -= 9 * dt;
        s.position.addScaledVector(v, dt);
        s.material.opacity = 1 - k;
      });
    }
  }

  // paper confetti in the captains' colours
  confetti(at, colours = ['#e5484d', '#3b7ff5', '#25a55f', '#ffc93c', '#f0559a'], n = 40) {
    n = this.light ? Math.ceil(n / 2) : n;
    const geo = new THREE.PlaneGeometry(0.12, 0.07);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.add(m, 1.6 + Math.random() * 0.6, (k, dt) => {
        v.y -= 7 * dt;
        v.multiplyScalar(1 - dt * 1.4);
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.material.opacity = k > 0.75 ? (1 - k) * 4 : 1;
      });
    }
  }

  // a flat ring of dust spreading out (a tile landing)
  ring(at, colour = '#fff4d8', size = 2.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.copy(at);
    m.position.y = Math.max(m.position.y, 0.03);
    this.add(m, 0.6, (k) => {
      m.scale.setScalar(0.6 + k * size);
      m.material.opacity = 0.8 * (1 - k);
    });
  }

  // a column of light going up (an array calibrating, a station sealing)
  beam(at, colour = '#7fe8ff', height = 9) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, height, 16, 1, true), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x, at.y + height / 2, at.z);
    this.add(m, 1.4, (k) => {
      m.material.opacity = 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.4));
      m.scale.set(1 + k, 1, 1 + k);
    });
    const flare = this.sprite(colour, 2.2);
    flare.position.copy(at).setY(at.y + 0.4);
    this.add(flare, 0.9, (k) => (flare.material.opacity = 1 - k));
  }

  // a little glowing ship running along a path of points (a finished lane)
  zip(points, colour = '#ffe9a8') {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().setY(TOP + 0.35)));
    const head = this.sprite(colour, 0.7);
    const trail = [];
    for (let i = 0; i < (this.light ? 4 : 9); i++) {
      const s = this.sprite(colour, 0.5 - i * 0.04, 0.7 - i * 0.07);
      trail.push(s);
      this.root.add(s);
    }
    const life = 0.5 + points.length * 0.12;
    this.add(head, life, (k) => {
      const p = curve.getPoint(Math.min(1, k));
      head.position.copy(p);
      trail.forEach((s, i) => s.position.copy(curve.getPoint(Math.max(0, k - (i + 1) * 0.025))));
      if (k >= 1) for (const s of trail) this.root.remove(s);
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      it.fn?.(k, dt);
      if (k >= 1) {
        this.root.remove(it.obj);
        it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}
