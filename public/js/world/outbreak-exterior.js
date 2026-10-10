// 🦠 The outside of Station Petri, for the Outbreak script: instead of solar
// wings, a comms mast and a shuttle, a research complex with a glowing biodome
// on a boardwalk off the Decon Chamber, cooling towers breathing steam off the
// Quarantine Cells, a big cryo tank behind the Cold Storage, a radar mast with a
// biohazard beacon behind the Specimen Gallery, a quarantine pod where the shuttle
// docked, a giant biohazard ring under the Containment Hub, and glowing tendrils
// of the Bloom creeping up the hull.
//
// Purely for looks (nobody can walk out here). Only built into the picture while
// the script is the Outbreak; the space-station exterior is hidden meanwhile.
import * as THREE from 'three';
import { M, T, add, cyl, box, ball, tor, mergeStatic } from './carnival-rooms.js';

const Y = -0.9; // just under deck level, like the station's own exterior
const HAZ = 0xffd23f;
const BLACK = 0x1a1a22;
const TOXIC = 0x7dff3a;
const TEAL = 0x38d6c8;
const PURPLE = 0x9a5bff;
const STEEL = 0x9aa7b5;
const DARK = 0x3a4650;

export class OutbreakExterior {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.anims = [];
    const S = new THREE.Group(); // static pieces, merged at the end
    const live = this.group;
    const livePlace = (x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      live.add(g);
      return g;
    };

    // ---------- the hub: a giant biohazard ring under the Containment Hub ----------
    add(S, tor(14, 0.9, 14, Math.PI * 2), T('diag', HAZ, BLACK, 24, 1), 0, -4.5, 0, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      add(S, ball(2.6, 18), M(HAZ, { e: 0.4, r: 0.4 }), Math.cos(a) * 14, -4.5, Math.sin(a) * 14);
      add(S, ball(1.2, 12), M(BLACK), Math.cos(a) * 14, -4.5, Math.sin(a) * 14, null, [1, 1, 1]);
      add(S, cyl(0.35, 0.35, 14, 8), M(STEEL), Math.cos(a) * 7, -4.5, Math.sin(a) * 7, [0, -a, Math.PI / 2]);
    }
    add(S, cyl(2.6, 1.8, 4.5, 20), M(DARK, { r: 0.4 }), 0, -3, 0);

    // ---------- west: a boardwalk to a glowing biodome ----------
    add(S, box(24, 0.2, 3.2), T('diag', HAZ, BLACK, 24, 1), -60.5, Y - 0.1, 0);
    const DX = -78;
    add(S, cyl(8.5, 8.8, 0.8, 32), M(DARK, { r: 0.4 }), DX, -1.1, 0);
    add(S, new THREE.SphereGeometry(8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M(0xbfeee0, { o: 0.18, r: 0.05 }), DX, -0.7, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(S, new THREE.TorusGeometry(8, 0.06, 4, 24, Math.PI), M(STEEL), DX, -0.7, 0, [0, a, 0]).rotation.set(0, a, 0);
    }
    // giant mushrooms and a pulsing core inside the dome
    [[-3, 2, 3.6, 1.7, 0x7dff3a], [2.5, -2, 2.6, 1.2, 0x6bffd8], [0, 3.5, 1.8, 0.9, 0xd18bff], [-1.5, -3.5, 2.2, 1.0, 0x9aff4a]].forEach(([x, z, h, r, c]) => {
      add(S, cyl(r * 0.22, r * 0.3, h, 10), M(0xe8f3d0, { e: 0.15 }), DX + x, -0.7 + h / 2, z);
      add(S, new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(c, { e: 0.8 }), DX + x, -0.7 + h, z, null, [1, 0.65, 1]);
    });
    const core = livePlace(DX, 2.2, 0);
    const coreMat = M(0xd9ff9a, { e: 1.6, o: 0.6 });
    add(core, ball(1.0, 16), coreMat, 0, 0, 0);
    this.anims.push((t) => core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.15));
    for (let i = 0; i < 5; i++) {
      const x = -52 - i * 4.4;
      add(S, cyl(0.07, 0.09, 2.4, 6), M(0x3a2a44), x, Y + 1.1, i % 2 ? 1.9 : -1.9);
    }

    // ---------- east: cooling towers breathing steam ----------
    add(S, box(26, 0.2, 3.2), T('diag', HAZ, BLACK, 26, 1), 66, Y - 0.1, 0);
    this.puffs = [];
    [[72, -9], [80, 7], [88, -6]].forEach(([x, z], k) => {
      const tower = new THREE.CylinderGeometry(3.2, 5, 11, 22, 1, true);
      add(S, tower, new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.8, side: THREE.DoubleSide }), x, 1.5, z);
      add(S, tor(3.2, 0.2, 22), M(0x9aa7b5), x, 7, z, [Math.PI / 2, 0, 0]);
      add(S, cyl(3.1, 3.1, 0.05, 22), M(0x15301a, { e: 0.4 }), x, 6.6, z);
      for (let i = 0; i < (lowFx ? 3 : 5); i++) {
        const puff = add(live, ball(1.6, 10), new THREE.MeshBasicMaterial({ color: 0xcdeed8, transparent: true, opacity: 0.2, depthWrite: false }), x, 8, z);
        this.puffs.push({ puff, x, z, phase: i / 5 + k * 0.17 });
      }
    });

    // ---------- south: a long cryo tank behind the Cold Storage ----------
    const TZ = 62;
    add(S, box(2.6, 0.18, 8), T('diag', HAZ, BLACK, 8, 1), 0, Y - 0.1, 52.6);
    add(S, cyl(4.2, 4.2, 15, 28), M(0xcde7f2, { r: 0.25 }), 0, -3.4, TZ, [Math.PI / 2, 0, 0]);
    for (let i = -3; i <= 3; i++) add(S, tor(4.25, 0.18, 28), M(DARK), 0, -3.4, TZ + i * 2.1);
    add(S, new THREE.SphereGeometry(4.2, 20, 12), M(0xcde7f2, { r: 0.25 }), 0, -3.4, TZ - 7.5);
    add(S, ball(0.6, 10), M(0x9be8ff, { e: 1.8 }), 0, 0.9, TZ);
    add(S, cyl(0.12, 0.12, 4, 6), M(STEEL), 0, -1.2, TZ);

    // ---------- north: a radar mast with a biohazard beacon ----------
    add(S, cyl(0.35, 0.5, 14, 8), M(STEEL), 0, 3, -52);
    add(S, tor(2.4, 0.12, 24), M(STEEL), 0, 9, -52, [0, 0, 0]);
    const radar = livePlace(0, 9.6, -52);
    add(radar, new THREE.SphereGeometry(2.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshStandardMaterial({ color: 0xdfe5ee, side: THREE.DoubleSide, roughness: 0.5 }), 0, 0, 0, [-1.0, 0, 0]);
    add(radar, cyl(0.05, 0.05, 2.4, 5), M(STEEL), 0, 0.8, -0.9, [0.5, 0, 0]);
    this.anims.push((t) => { radar.rotation.y = Math.sin(t * 0.25) * 0.8; });
    const beacon = livePlace(0, 10.8, -52);
    const beaconMat = M(TOXIC, { e: 1.8 });
    add(beacon, ball(0.5, 10), beaconMat, 0, 0, 0);
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: TOXIC, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    wedge.rotation.z = Math.PI / 2;
    wedge.position.x = 3.4;
    const sweep = new THREE.Group();
    sweep.add(wedge);
    beacon.add(sweep);
    this.anims.push((t, dt) => { sweep.rotation.y += dt * 1.6; });
    // specimen pods drifting out in the dark
    this.pods = [];
    for (const [x, z] of [[-24, -48], [26, -50], [-34, -60], [36, -58]]) {
      const pod = livePlace(x, 2, z);
      add(pod, new THREE.CapsuleGeometry(1.1, 1.8, 4, 12), M(0xbfeee0, { o: 0.25, r: 0.05 }), 0, 0, 0);
      add(pod, ball(0.7, 12), M(PURPLE, { e: 1.2, o: 0.9 }), 0, 0, 0, null, [1, 1.3, 1]);
      this.pods.push({ pod, x, z, ph: x });
    }

    // ---------- a quarantine pod where the shuttle docked ----------
    const capsule = livePlace(-41, Y + 0.3, 24);
    capsule.rotation.y = Math.PI / 2;
    add(capsule, cyl(1.3, 1.3, 4.4, 20), T('diag', HAZ, BLACK, 5, 4), 0, 0, 0, [Math.PI / 2, 0, 0]);
    add(capsule, new THREE.ConeGeometry(1.3, 2.2, 20), M(0x3a4650, { r: 0.4 }), 0, 0, -3.3, [-Math.PI / 2, 0, 0]);
    add(capsule, cyl(0.7, 0.9, 1.2, 14), M(STEEL), 0, 0, 2.7, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) add(capsule, ball(0.26, 10), M(0xcfe9ff, { e: 1.2 }), 0, 1.25, -1.4 + i * 1.0);
    add(capsule, tor(0.5, 0.06, 3, Math.PI * 2), M(BLACK), 0, 1.32, 0.2, [Math.PI / 2, 0, 0]);

    // ---------- the Bloom's tendrils: glowing vines creeping up from below ----------
    const TENDRILS = lowFx ? 10 : 18;
    for (let i = 0; i < TENDRILS; i++) {
      const a = (i / TENDRILS) * Math.PI * 2 + (i % 3) * 0.2;
      const r0 = 38 + (i % 4) * 12;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        const rr = r0 - u * (14 + (i % 3) * 5);
        const aa = a + Math.sin(u * 4 + i) * 0.1;
        pts.push(new THREE.Vector3(Math.cos(aa) * rr * (1 + 0.5 * Math.abs(Math.cos(aa))), -40 + u * 38 + Math.sin(u * 5 + i) * 2, Math.sin(aa) * rr * 0.9));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      add(S, new THREE.TubeGeometry(curve, 24, 0.5 + (i % 3) * 0.2, 5, false), M(i % 2 ? TOXIC : 0x6bffd8, { e: 0.9, r: 0.5 }), 0, 0, 0);
      const tip = curve.getPoint(1);
      add(S, ball(0.9, 8), M(0xd9ff9a, { e: 1.4 }), tip.x, tip.y, tip.z);
    }

    this.group.add(mergeStatic(S));
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    for (const { puff, x, z, phase } of this.puffs) {
      const u = (t * 0.12 + phase) % 1;
      puff.position.set(x + Math.sin(t * 0.4 + phase * 9) * 1.2, 7.5 + u * 9, z);
      puff.scale.setScalar(0.7 + u * 1.4);
      puff.material.opacity = 0.22 * (1 - u);
    }
    for (const { pod, ph } of this.pods) {
      pod.position.y = 2 + Math.sin(t * 0.5 + ph) * 0.8;
      pod.rotation.z = Math.sin(t * 0.3 + ph) * 0.3;
    }
  }
}
