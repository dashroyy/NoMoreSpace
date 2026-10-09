// Clues as real objects: for about 20 seconds while the crew explores,
// something drifts past just outside the ship's north edge, beyond the
// Observation Deck. Blink and you miss it.
//   comets        3 comets in players' suit colours (one carries spores)
//   probe         a tumbling derelict probe, its beacon blinking a suit colour
//   constellation a role's icon drawn in stars (living = warm, dead = cold)
//   drift-count   N little buoys blinking together
import * as THREE from 'three';
import { paintConstellation } from './sky.js';

// The path: west to east, outside the north wall of the Observation Deck
// (z = -34), seen over the wall from inside the room.
const PATH = { x0: -16, x1: 16, z: -42, y: 1 };

const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

export class Flyby {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.key = '';
    this.parts = [];
  }

  // clue: { kind, players, role, count, at, until } with server times; helpers give colours and icons
  set(clue, { colorOf, iconOf }) {
    const key = clue ? JSON.stringify([clue.kind, clue.players, clue.role, clue.count, clue.at]) : '';
    if (key === this.key) return;
    this.key = key;
    this.clear();
    this.clue = clue;
    if (!clue) return;
    const k = clue.kind;
    if (k === 'dead-constellation' || k === 'living-constellation' || k === 'role-comets') this.addConstellation(iconOf(clue.role), k !== 'dead-constellation');
    if (k === 'comets' || k === 'role-comets') (clue.players || []).forEach((id, i) => this.addComet(colorOf(id), i));
    if (k === 'probe') this.addProbe(colorOf(clue.players?.[0]));
    // zero drifters: three dead buoys that never light up
    if (k === 'drift-count') for (let i = 0, n = clue.count || 3; i < n; i++) this.addBuoy(i, n, !clue.count);
  }

  clear() {
    for (const p of this.parts) {
      this.group.remove(p.obj);
      p.obj.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
    }
    this.parts = [];
    this.group.visible = false;
  }

  addConstellation(emoji, living) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(8, 8, 1);
    this.parts.push({
      obj: sprite,
      update: (p, t) => {
        // repaint a few times a second so the stars twinkle
        if (Math.floor(t * 6) !== this.lastPaint) {
          this.lastPaint = Math.floor(t * 6);
          ctx.clearRect(0, 0, 256, 256);
          paintConstellation(ctx, 128, 128, 220, emoji, living, t);
          tex.needsUpdate = true;
        }
        sprite.position.set(lerp(-6, 6, p), PATH.y + 1.2, PATH.z - 5);
        // fade in and out; a dead constellation also flickers
        sprite.material.opacity = fade(p) * (living ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(t * 7)));
      },
    });
  }

  addComet(color, i) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), glowMat(0xffffff)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), glowMat(color, 0.55)));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.75, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    tail.rotation.z = Math.PI / 2; // points back along -x
    tail.position.x = -3.7;
    g.add(tail);
    // each comet crosses quickly, one after another
    const start = 0.1 + i * 0.22;
    this.parts.push({
      obj: g,
      update: (p) => {
        const q = (p - start) / 0.3;
        g.visible = q > 0 && q < 1;
        g.position.set(lerp(PATH.x0 - 6, PATH.x1 + 6, q), PATH.y + 1.1 * i + q * 1.2, PATH.z - i * 1.4);
        g.rotation.z = -0.05;
      },
    });
  }

  addProbe(color) {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.6, roughness: 0.4 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x23356b, metalness: 0.3, roughness: 0.5, emissive: 0x0a1430 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), hull));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.8), panel);
      p.position.x = s * 1.6;
      g.add(p);
    }
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 14, 1, true), hull);
    dish.position.set(0, 0.6, 0);
    g.add(dish);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), hull);
    mast.position.y = 0.9;
    g.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glowMat(color));
    beacon.position.y = 1.4;
    g.add(beacon);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 1.4;
    g.add(halo);
    g.scale.setScalar(1.1);
    this.parts.push({
      obj: g,
      update: (p, t) => {
        g.position.set(lerp(PATH.x0, PATH.x1, p), PATH.y + Math.sin(t * 0.8) * 0.4, PATH.z);
        g.rotation.set(Math.sin(t * 0.4) * 0.5, t * 0.6, Math.sin(t * 0.3) * 0.3);
        const on = Math.sin(t * 6) > 0;
        beacon.visible = on;
        halo.visible = on;
      },
    });
  }

  addBuoy(i, n, dead = false) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x4a4f5f, metalness: 0.5, roughness: 0.5 })));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat(0xb8ff9a));
    light.position.y = 0.55;
    g.add(light);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb8ff9a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 0.55;
    g.add(halo);
    g.scale.setScalar(1.3);
    const spread = 3.2;
    this.parts.push({
      obj: g,
      update: (p, t) => {
        g.position.set(lerp(-10, 10, p) + (i - (n - 1) / 2) * spread, PATH.y + (i % 2) * 0.9 + Math.sin(t + i) * 0.2, PATH.z - (i % 2) * 1.2);
        g.rotation.z = Math.sin(t * 0.7 + i) * 0.3;
        // all blink together, then go still
        const cycle = t % 4;
        const on = !dead && cycle < 2.4 && Math.sin(cycle * Math.PI * 2.5) > 0;
        light.material.color.setHex(on ? 0xb8ff9a : 0x1b2a18);
        halo.visible = on;
      },
    });
  }

  // now: server time in ms; t: seconds for animation
  update(now, t) {
    const c = this.clue;
    const live = c && now >= c.at && now <= c.until;
    if (live && !this.group.children.length) for (const p of this.parts) this.group.add(p.obj);
    this.group.visible = !!live;
    if (!live) return;
    const p = (now - c.at) / (c.until - c.at);
    for (const part of this.parts) part.update(p, t);
  }

  get live() {
    return this.group.visible;
  }
}

const lerp = (a, b, k) => a + (b - a) * k;
const fade = (p) => Math.min(1, p * 6, (1 - p) * 6);
