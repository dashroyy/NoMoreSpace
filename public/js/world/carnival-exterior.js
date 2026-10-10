// 🎪 The outside of the Cosmic Carnival's ship. Instead of solar wings, a comms
// mast and a shuttle, the Big Top is surrounded by the rest of the fairground:
// a roller coaster running off the Caravans, a swing ride at the end of a
// boardwalk off the Human Cannon, a big striped tent behind the Prop Room, a
// banner and balloons behind the Ferris Wheel, a circus rocket where the shuttle
// docked, and a giant striped drum under the Center Ring. Blinking bulbs chase
// round the tent, the coaster and the lamp posts.
//
// Purely for looks (nobody can walk out here). Only built into the picture while
// the script is the Carnival; the space-station exterior is hidden meanwhile.
import * as THREE from 'three';
import { M, T, add, cyl, box, ball, tor, mergeStatic, PALETTE, RED, GOLD, CREAM, PINK, TEAL, PURPLE, BLUE } from './carnival-rooms.js';

const Y = -0.9; // just under deck level, like the station's own exterior

function bannerMaterial() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#b3182f');
  grad.addColorStop(0.5, '#e8203a');
  grad.addColorStop(1, '#b3182f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 1012, 116);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 66px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#5a0a18';
  g.shadowBlur = 8;
  g.fillText('★ THE GREATEST SHOW IN THE GALAXY ★', 512, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
}

export class CarnivalExterior {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.anims = [];
    this.bulbs = []; // { mat, phase }: they chase around in turn
    const S = new THREE.Group(); // static pieces, merged at the end
    const live = this.group;

    // a bulb that blinks in the chase
    const bulb = (parent, x, y, z, phase, color = 0xfff0a0) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      add(parent, ball(0.16, 8), mat, x, y, z);
      this.bulbs.push({ mat, phase, color: new THREE.Color(color) });
    };
    const livePlace = (x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      live.add(g);
      return g;
    };

    // ---------- the hub: a giant striped drum under the Center Ring ----------
    add(S, cyl(14, 14, 2.4, 56), T('stripes', RED, CREAM, 28, 1), 0, -4.2, 0);
    for (const y of [-3, -5.4]) add(S, tor(14, 0.28, 56), M(GOLD, { e: 0.5, r: 0.3 }), 0, y, 0, [Math.PI / 2, 0, 0]);
    add(S, cyl(2.6, 2.0, 4.5, 24), T('stripes', TEAL, CREAM, 8, 1), 0, -3, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(S, cyl(0.3, 0.3, 14, 8), M(GOLD, { e: 0.3 }), Math.cos(a) * 7.5, -4.6, Math.sin(a) * 7.5, [0, -a, Math.PI / 2]);
    }

    // ---------- west: a boardwalk off the Human Cannon, and a swing ride ----------
    add(S, box(24, 0.2, 3.2), T('stripes', GOLD, PURPLE, 24, 1), -60.5, Y - 0.1, 0);
    for (let i = 0; i < 6; i++) {
      const x = -52 - i * 3.8;
      const z = i % 2 ? 1.9 : -1.9;
      add(S, cyl(0.07, 0.09, 2.4, 6), M(0x3a2a44), x, Y + 1.1, z);
      bulb(live, x, Y + 2.4, z, i * 0.7);
    }
    const SWING_X = -78;
    add(S, cyl(4.8, 5, 0.5, 32), T('stripes', RED, CREAM, 16, 1), SWING_X, -1.1, 0);
    add(S, cyl(0.4, 0.55, 9, 12), T('stripes', TEAL, CREAM, 4, 3), SWING_X, 3.4, 0);
    const top = livePlace(SWING_X, 7.7, 0);
    add(top, new THREE.ConeGeometry(4.8, 1.7, 28), T('stripes', PINK, CREAM, 14, 1), 0, 0.85, 0);
    add(top, tor(4.6, 0.12, 32), M(GOLD, { e: 0.6 }), 0, 0, 0, [Math.PI / 2, 0, 0]);
    add(top, ball(0.28, 10), M(GOLD, { e: 0.9 }), 0, 1.85, 0);
    const swings = [];
    const SEATS = 10;
    for (let i = 0; i < SEATS; i++) {
      const a = (i / SEATS) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 4.3, 0, Math.sin(a) * 4.3);
      pivot.rotation.y = -a; // local +x points away from the pole
      top.add(pivot);
      const swing = new THREE.Group();
      pivot.add(swing);
      add(swing, cyl(0.025, 0.025, 4.2, 4), M(0xcfcfdd), 0, -2.1, 0);
      add(swing, box(0.7, 0.14, 0.7), M(PALETTE[i % PALETTE.length], { e: 0.2 }), 0, -4.25, 0);
      add(swing, box(0.7, 0.45, 0.1), M(PALETTE[i % PALETTE.length]), 0, -4.0, -0.3);
      swings.push(swing);
      if (i % 2 === 0) bulb(pivot, 0, 0.1, 0, i * 0.4 + 2);
    }
    this.anims.push((t, dt) => {
      top.rotation.y += dt * (0.7 + Math.sin(t * 0.2) * 0.25);
      const tilt = 0.45 + Math.sin(t * 0.5) * 0.15;
      for (const s of swings) s.rotation.z = tilt;
    });

    // ---------- east: a roller coaster off the Caravans ----------
    const track = new THREE.CatmullRomCurve3([
      [58, 0.2, 0], [64, 3, -7], [72, 7.2, -11.5], [80, 2.4, -8.5], [88, -2.5, 0], [82, 2.6, 8.5], [73, 7.4, 11.5], [65, 2.4, 7],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.5);
    add(S, new THREE.TubeGeometry(track, 220, 0.2, 6, true), M(RED, { e: 0.15, r: 0.35 }), 0, 0, 0);
    add(S, new THREE.TubeGeometry(track, 220, 0.09, 5, true), M(GOLD, { e: 0.5 }), 0, -0.45, 0);
    for (let i = 0; i < 32; i++) {
      const p = track.getPointAt(i / 32);
      const h = p.y + 8;
      add(S, cyl(0.1, 0.12, h, 6), T('stripes', TEAL, CREAM, 1, Math.max(2, Math.round(h))), p.x, p.y - h / 2 - 0.3, p.z);
      if (i % 2 === 0) bulb(live, p.x, p.y + 0.5, p.z, i * 0.31 + 1);
    }
    const cars = [0, 1, 2, 3].map((i) => {
      const car = new THREE.Group();
      add(car, box(0.9, 0.5, 1.4), M(PALETTE[i % PALETTE.length], { e: 0.2 }), 0, 0.5, 0);
      add(car, box(0.9, 0.35, 0.1), M(CREAM), 0, 0.85, 0.5);
      add(car, ball(0.2, 8), M(0xffd8b8), -0.2, 0.95, -0.15);
      add(car, ball(0.2, 8), M(0xffd8b8), 0.2, 0.95, -0.15);
      live.add(car);
      return car;
    });
    const ahead = new THREE.Vector3();
    this.anims.push((t) => {
      cars.forEach((car, i) => {
        const u = (((t * 0.022 - i * 0.017) % 1) + 1) % 1;
        track.getPointAt(u, car.position);
        track.getPointAt((u + 0.004) % 1, ahead);
        car.lookAt(ahead);
      });
    });

    // ---------- south: the big top, sunk below the deck so it never hides anyone ----------
    const TZ = 59;
    add(S, box(2.6, 0.18, 8), T('stripes', RED, CREAM, 8, 1), 0, Y - 0.1, 52.6); // the walkway from the Prop Room
    add(S, cyl(6.5, 6.5, 1.5, 36), T('stripes', RED, CREAM, 18, 1), 0, -3.5, TZ);
    add(S, new THREE.ConeGeometry(7, 2.6, 36), T('stripes', RED, CREAM, 18, 1), 0, -1.45, TZ);
    add(S, ball(0.3, 10), M(GOLD, { e: 0.9 }), 0, -0.05, TZ);
    add(S, cyl(0.05, 0.05, 1.8, 5), M(0xcfcfdd), 0, 0.8, TZ);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      bulb(live, Math.cos(a) * 6.55, -2.65, TZ + Math.sin(a) * 6.55, i * 0.25);
    }
    // an entrance, with a red carpet
    add(S, box(2.4, 1.3, 0.2), M(0x1a0a22), 0, -3.4, TZ - 6.5);
    add(S, box(2.2, 0.06, 4), M(RED), 0, -2.9, TZ - 8.3);

    // ---------- north: a banner and balloons behind the Ferris Wheel ----------
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.25), bannerMaterial());
    banner.position.set(0, 8, -60);
    live.add(banner);
    for (const x of [-13.3, 13.3]) {
      add(S, cyl(0.2, 0.25, 15, 10), T('stripes', RED, CREAM, 4, 8), x, 1.5, -60);
      add(S, ball(0.4, 10), M(GOLD, { e: 0.9 }), x, 9.2, -60);
    }
    this.clusters = [];
    for (const x of [-24, 24]) {
      const g = livePlace(x, 0, -46);
      add(S, cyl(0.1, 0.12, 2, 6), M(0x3a2a44), x, -0.5, -46);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const bx = Math.cos(a) * 1.1;
        const bz = Math.sin(a) * 1.1;
        const by = 6 + (k % 3) * 0.9;
        add(g, ball(0.7, 12), M(PALETTE[(k + (x > 0 ? 3 : 0)) % PALETTE.length], { e: 0.3, r: 0.25 }), bx, by, bz, null, [1, 1.2, 1]);
        add(g, new THREE.CylinderGeometry(0.012, 0.012, by, 3), M(0xeeeeee), bx / 2, by / 2 - 0.5, bz / 2, [bz * 0.02, 0, -bx * 0.02]);
      }
      this.clusters.push(g);
    }

    // ---------- a circus rocket where the shuttle docked ----------
    const rocket = livePlace(-41, Y + 0.3, 24);
    rocket.rotation.y = Math.PI / 2;
    add(rocket, cyl(1.3, 1.3, 4.6, 20), T('stripes', RED, CREAM, 6, 3), 0, 0, 0, [Math.PI / 2, 0, 0]);
    add(rocket, new THREE.ConeGeometry(1.3, 2.4, 20), M(GOLD, { e: 0.5, r: 0.3 }), 0, 0, -3.5, [-Math.PI / 2, 0, 0]);
    for (const a of [0, 2.1, 4.2]) add(rocket, box(0.12, 1.8, 1.4), M(BLUE), Math.sin(a) * 1.5, Math.cos(a) * 1.5, 2.0, [0, 0, -a]);
    add(rocket, cyl(0.7, 0.9, 1.2, 14), M(0x4a4a58), 0, 0, 2.8, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) add(rocket, ball(0.28, 10), M(0xcfe9ff, { e: 1.2 }), 0, 1.25, -1.6 + i * 1.0);
    // a happy red nose on its tip
    add(rocket, ball(0.42, 12), M(RED, { e: 0.8, r: 0.25 }), 0, 0, -4.8);

    this.group.add(mergeStatic(S));
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    this.clusters.forEach((g, i) => { g.position.y = Math.sin(t * 0.8 + i * 2) * 0.35; });
    // the chase: each bulb is bright for a short moment in every cycle
    for (const b of this.bulbs) {
      const k = (t * 1.2 + b.phase) % 1;
      const on = k < 0.35;
      b.mat.color.copy(b.color).multiplyScalar(on ? 1 : 0.25);
    }
  }
}
