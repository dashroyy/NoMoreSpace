// 🗡️ The outside of the Citadel, for the Citadel of Traitors script: instead of solar
// wings, a comms mast and a shuttle, the station sits on a jagged crag of floating
// rock. Round towers with conical roofs stand at the corners, a great keep rises
// behind the Battlements with a beacon fire on its tallest turret, a drawbridge
// runs out from the Banishment Gate to a gatehouse and then, past the gatehouse,
// a single plank over nothing at all. Gold crystals of star-gold float over the
// rock, mist rolls under it and ravens circle the towers.
//
// Purely for looks (nobody can walk out here). Only built into the picture while
// the script is the Citadel; the space-station exterior is hidden meanwhile.
import * as THREE from 'three';
import { M, T, add, cyl, box, ball, tor, mergeStatic } from './carnival-rooms.js';
import { bannerMat, glowTex, mistTex } from './traitors-rooms.js';

const Y = -0.9; // just under deck level, like the station's own exterior
const STONE = 0x6a6672;
const DSTONE = 0x45414d;
const WOOD = 0x6b4426;
const DWOOD = 0x3d2614;
const IRON = 0x2b2b33;
const GOLD = 0xd9a441;
const CRIMSON = 0xa3162b;
const SLATE = 0x2f3550;
const WIN = 0xffc060;

// a cheap smooth noise, good enough to rough up a rock
const n3 = (x, y, z) => Math.sin(x * 1.9 + Math.sin(y * 2.3)) * Math.sin(y * 1.7 + Math.sin(z * 2.1)) * Math.sin(z * 2.3 + Math.sin(x * 1.3));

export class TraitorsExterior {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.lowFx = lowFx;
    this.anims = [];
    this.flags = [];
    this.flames = [];
    const S = new THREE.Group(); // static pieces, merged at the end
    const base = -2;

    // ---------- the crag: a floating rock under the whole station ----------
    this.rock();

    // ---------- helpers ----------
    const glowing = (color, e) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: e, roughness: 0.5, fog: false });
    const flag = (x, y, z, w = 2.6, h = 1.4, i = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      add(g, box(w, h, 0.05), bannerMat(i), w / 2, 0, 0);
      this.group.add(g);
      this.flags.push({ g, ph: x + z });
    };
    const merlons = (g, x, y, z, r, n, size = 1.0) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        add(g, box(size, size * 0.9, size * 0.8), M(STONE), x + Math.cos(a) * r, y, z + Math.sin(a) * r, [0, -a, 0]);
      }
    };
    const tower = (x, z, r, h, roof = SLATE, flagIndex = 0, top = 'cone') => {
      add(S, cyl(r * 1.15, r * 1.3, 3.2, 14), M(DSTONE), x, base + 1.4, z);
      add(S, cyl(r, r * 1.06, h, 14), M(STONE, { r: 0.95 }), x, base + h / 2 + 1, z);
      for (let k = 1; k < 4; k++) add(S, tor(r * 1.03, 0.14, 16), M(DSTONE), x, base + 1 + (h * k) / 4, z, [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4 + x;
        add(S, box(0.55, 1.2, 0.3), M(WIN, { e: 1.5 }), x + Math.cos(a) * (r + 0.02), base + 2.5 + ((i * 7) % 5) * (h / 6.5), z + Math.sin(a) * (r + 0.02), [0, -a + Math.PI / 2, 0]);
      }
      const topY = base + h + 1;
      add(S, cyl(r * 1.3, r * 1.1, 0.9, 14), M(DSTONE), x, topY - 0.1, z);
      if (top === 'cone') {
        add(S, new THREE.ConeGeometry(r * 1.45, h * 0.5, 14), M(roof, { r: 0.8 }), x, topY + h * 0.25 + 0.3, z);
        add(S, cyl(0.05, 0.05, 3.2, 5), M(IRON), x, topY + h * 0.5 + 1.2, z);
        add(S, ball(0.22, 6), M(GOLD, { e: 0.4 }), x, topY + h * 0.5 + 2.8, z);
        flag(x, topY + h * 0.5 + 1.6, z, 2.4, 1.2, flagIndex);
      } else {
        merlons(S, x, topY + 0.9, z, r * 1.2, 12, 1.1);
        this.fireBasket(x, topY + 0.5, z, 1.4);
      }
    };
    const wallX = (z, xa, xb, h = 4, t = 1.6) => {
      const len = Math.abs(xb - xa);
      const cx = (xa + xb) / 2;
      add(S, box(len, h, t), M(STONE, { r: 0.95 }), cx, base + h / 2 + 1, z);
      add(S, box(len, 0.3, t + 0.5), M(DSTONE), cx, base + h + 1.1, z);
      for (let x = xa + 1; x < xb - 0.5; x += 2.4) add(S, box(1.2, 1.0, t * 0.8), M(STONE), x, base + h + 1.8, z);
    };
    const wallZ = (x, za, zb, h = 4, t = 1.6) => {
      const len = Math.abs(zb - za);
      const cz = (za + zb) / 2;
      add(S, box(t, h, len), M(STONE, { r: 0.95 }), x, base + h / 2 + 1, cz);
      add(S, box(t + 0.5, 0.3, len), M(DSTONE), x, base + h + 1.1, cz);
      for (let z = za + 1; z < zb - 0.5; z += 2.4) add(S, box(t * 0.8, 1.0, 1.2), M(STONE), x, base + h + 1.8, z);
    };

    // ---------- north: the great keep behind the Battlements ----------
    const KX = 2;
    const KZ = -70;
    add(S, box(18, 26, 16), M(STONE, { r: 0.95 }), KX, base + 14, KZ);
    add(S, box(19.4, 1.2, 17.4), M(DSTONE), KX, base + 27.4, KZ);
    for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) add(S, box(1.4, 1.1, 1.0), M(STONE), KX - 8 + i * 2.3, base + 28.6, KZ + sz * 8.2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) add(S, box(0.9, 1.7, 0.3), M(WIN, { e: 1.6 }), KX - 6 + c * 4, base + 6 + r * 5, KZ + 8.1);
    add(S, box(3.4, 5, 0.4), M(DWOOD), KX, base + 3.5, KZ + 8.2); // the great door
    add(S, new THREE.CylinderGeometry(1.7, 1.7, 0.4, 14, 1, false, 0, Math.PI), M(DWOOD), KX, base + 6, KZ + 8.2, [Math.PI / 2, 0, 0]);
    add(S, box(3.7, 0.3, 0.5), M(IRON), KX, base + 5.0, KZ + 8.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      tower(KX + sx * 9.5, KZ + sz * 8.5, 2.6, 30 + (sx + sz > 0 ? 4 : 0), SLATE, sx + sz + 3, sx === 1 && sz === -1 ? 'fire' : 'cone');
    }
    flag(KX - 1.5, base + 24, KZ + 8.5, 3, 9, 0);
    // the beacon on the tallest turret throws a slow gold sweep
    const beacon = new THREE.Group();
    beacon.position.set(KX + 9.5, base + 38.5, KZ - 8.5);
    this.group.add(beacon);
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    wedge.rotation.z = Math.PI / 2;
    wedge.position.x = 4;
    const sweep = new THREE.Group();
    sweep.add(wedge);
    beacon.add(sweep);
    this.anims.push((t, dt) => { sweep.rotation.y += dt * 0.9; });

    // ---------- the outer wall and its towers ----------
    tower(-62, -44, 4.2, 20, 0x5a1a28, 0);
    tower(66, -46, 4.2, 22, SLATE, 1);
    tower(-60, 54, 3.6, 12, SLATE, 2, 'fire');
    tower(68, 56, 3.6, 12, 0x5a1a28, 1);
    wallX(-48, -58, -30, 5);
    wallX(-48, 36, 62, 5);
    wallZ(-64, -40, -22, 4);
    wallZ(70, -42, 52, 4);
    wallX(60, -56, -14, 3.2);
    wallX(60, 14, 64, 3.2);

    // ---------- east: the Bedchamber turrets ----------
    tower(66, -8, 3.2, 17, 0x5a1a28, 0);
    tower(66, 18, 3.0, 14, SLATE, 2);

    // ---------- south: a squat gatehouse behind the Wine Cellar ----------
    for (const sx of [-1, 1]) tower(sx * 9, 62, 3.3, 9, SLATE, 1 + sx);
    add(S, box(14.6, 3, 3.4), M(STONE), 0, base + 8.6, 62);
    add(S, new THREE.CylinderGeometry(3.6, 3.6, 3.6, 14, 1, false, 0, Math.PI), M(0x15101a), 0, base + 4.4, 62.2, [Math.PI / 2, 0, 0]);
    add(S, box(7.2, 3.2, 3.4), M(0x15101a), 0, base + 2.6, 62.2);
    add(S, box(2.4, 0.3, 18), T('checker', 0x3a3a44, 0x2e2e38, 1, 9), 0, Y - 0.15, 53);

    // ---------- west: the drawbridge from the Banishment Gate, a gatehouse, and then a plank ----------
    add(S, box(15, 0.4, 3.8), T('stripes', 0x6b4426, 0x5a3820, 6, 1), -55.5, Y - 0.1, 0);
    for (const sz of [-1, 1]) {
      add(S, box(15, 0.7, 0.3), M(DWOOD), -55.5, Y + 0.3, sz * 2.0);
      for (let k = 0; k < 6; k++) add(S, cyl(0.05, 0.05, 0.9, 4), M(IRON), -49 - k * 2.6, Y + 0.7, sz * 2.0);
    }
    for (const sz of [-1, 1]) {
      tower(-70, sz * 7, 3.4, 15, 0x5a1a28, sz > 0 ? 0 : 1);
      // chains from the bridge head up to the gatehouse
      add(S, cyl(0.07, 0.07, 14.5, 4), M(IRON), -62.5, base + 7.5, sz * 2.2, [0, 0, 1.25]);
    }
    add(S, box(4, 3.2, 14), M(STONE), -70, base + 14.6, 0);
    add(S, new THREE.CylinderGeometry(6.2, 6.2, 4, 18, 1, false, 0, Math.PI), M(0x15080a), -70, base + 6, 0, [Math.PI / 2, 0, Math.PI / 2]);
    add(S, box(0.4, 0.5, 4), M(CRIMSON, { e: 0.35 }), -70.3, base + 3.2, 0); // a red glow in the gate
    this.plank = new THREE.Group();
    this.plank.position.set(-81, Y - 0.1, 0);
    this.group.add(this.plank);
    add(this.plank, box(11, 0.3, 1.1), T('stripes', 0x6b4426, 0x5a3820, 4, 1), 0, 0, 0);
    add(this.plank, cyl(0.04, 0.04, 1.2, 4), M(IRON), 5.4, 0.6, 0.5);
    const lantern = add(this.plank, ball(0.22, 8), glowing(0xff3a3a, 1.8), 5.4, 1.3, 0.5);
    this.anims.push((t) => { this.plank.rotation.z = Math.sin(t * 0.5) * 0.015; lantern.scale.setScalar(0.85 + Math.sin(t * 7) * 0.12 + Math.sin(t * 2.3) * 0.08); });

    // ---------- star-gold crystals in the rock, and floating above it ----------
    const gold = glowing(0xffd23f, 0.9);
    const goldDeep = glowing(0xe0902a, 0.7);
    this.crystals = [];
    const clusters = lowFx ? 6 : 12;
    for (let i = 0; i < clusters; i++) {
      const a = (i / clusters) * Math.PI * 2 + 0.3;
      const rad = 70 + (i % 3) * 6;
      const cx = 2 + Math.cos(a) * rad * 1.05;
      const cz = 7 + Math.sin(a) * rad * 0.85;
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.7 + (k % 2) * 0.4, 3.5 + k * 1.2, 5), k % 2 ? gold : goldDeep);
        c.position.set(cx + Math.cos(k * 1.7) * 1.6, -6 - (i % 4) * 3 + k * 0.7, cz + Math.sin(k * 1.7) * 1.6);
        c.rotation.set(Math.sin(k + i) * 0.5, 0, Math.cos(k * 2 + i) * 0.5 + (cx > 2 ? -0.9 : 0.9));
        this.group.add(c);
      }
    }
    for (let i = 0; i < (lowFx ? 5 : 11); i++) {
      const g = new THREE.Group();
      // out beyond the station, never over the rooms where they would hang in front of the players
      const a = Math.random() * Math.PI * 2;
      const rad = 74 + Math.random() * 22;
      g.position.set(2 + Math.cos(a) * rad * 1.05, 3 + Math.random() * 7, 7 + Math.sin(a) * rad * 0.9);
      add(g, new THREE.OctahedronGeometry(0.5 + Math.random() * 0.3), gold, 0, 0, 0, null, [0.7, 1.4, 0.7]);
      this.group.add(g);
      this.crystals.push({ g, ph: Math.random() * 6, y: g.position.y });
    }

    // ---------- mist under the crag ----------
    this.mists = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(220 - i * 40, 220 - i * 40), new THREE.MeshBasicMaterial({ map: mistTex(), color: i === 1 ? 0xc06070 : 0x9a9ac0, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(2, -18 - i * 6, 7);
      this.group.add(m);
      this.mists.push({ m, ph: i * 2.1 });
    }

    // ---------- ravens circling the towers ----------
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.4, 0.3, -0.5, -0.3, 0, 0.8, 0, 0, 0, 1.4, 0.3, -0.5, 0.3, 0, 0.8]), 3));
    wing.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x0a070c, side: THREE.DoubleSide, fog: false });
    this.birds = [];
    for (let i = 0; i < (lowFx ? 5 : 12); i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 4), birdMat);
      body.scale.set(0.6, 0.5, 1.4);
      g.add(body, new THREE.Mesh(wing, birdMat));
      this.group.add(g);
      const home = i % 2 ? [KX, KZ] : [66, -46];
      this.birds.push({ g, cx: home[0], cz: home[1], a: Math.random() * 6.28, r: 14 + Math.random() * 12, y: 22 + Math.random() * 14, s: 0.4 + Math.random() * 0.3, ph: Math.random() * 6 });
    }

    this.group.add(mergeStatic(S));
  }

  // a fire basket on top of a tower: a bowl of coals and flickering tongues
  fireBasket(x, y, z, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.group.add(g);
    add(g, cyl(0.7 * s, 0.4 * s, 0.6 * s, 8), M(IRON, { r: 0.5 }), 0, 0, 0);
    add(g, cyl(0.62 * s, 0.62 * s, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff5a1a, emissiveIntensity: 1.4, fog: false }), 0, 0.3 * s, 0);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa43a, fog: false });
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 1.4 * s, 6), fm);
      f.position.set((i % 2 - 0.5) * 0.4 * s, 0.9 * s, (i > 1 ? 0.3 : -0.3) * s);
      g.add(f);
      this.flames.push({ f, ph: i * 1.7 + x, s });
    }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    spr.scale.setScalar(7 * s);
    spr.position.y = 1.2 * s;
    g.add(spr);
    this.flames.push({ spr, ph: x });
  }

  // the floating crag the whole citadel stands on
  rock() {
    const geo = new THREE.IcosahedronGeometry(1, this.lowFx ? 4 : 5).toNonIndexed();
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const RX = 78;
    const RY = 46;
    const RZ = 66;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.hypot(x, y, z) || 1;
      x /= len;
      y /= len;
      z /= len;
      // the same vertex must land in the same place wherever it is shared: a pure function of its direction
      const crag = n3(x * 3 + 1, y * 3, z * 3) * 0.12 + n3(x * 7, y * 7 + 2, z * 7) * 0.05 + n3(x * 15, y * 15, z * 15 + 4) * 0.02;
      let px;
      let py;
      let pz;
      if (y >= 0) {
        // the top: a rough, nearly flat plateau just under the deck
        px = x * RX * (1 + crag);
        pz = z * RZ * (1 + crag);
        py = -2.6 + y * 1.2 + crag * 6;
      } else {
        const taper = 1 - 0.62 * Math.pow(-y, 1.15);
        px = x * RX * taper * (1 + crag * 1.5);
        pz = z * RZ * taper * (1 + crag * 1.5);
        py = -2.6 + y * RY * (1 + crag * 2.2);
      }
      pos.setXYZ(i, px + 2, py, pz + 7);
      const t = Math.max(0, Math.min(1, -y));
      // moss-dark on top, bruised grey-purple down the sides, nearly black at the tip
      c.setRGB(0.2 + (1 - t) * 0.06 + crag * 0.4, 0.2 + (1 - t) * 0.1 + crag * 0.3, 0.26 + (1 - t) * 0.02 + crag * 0.3);
      if (y > 0.2) c.setRGB(0.07 + crag * 0.5, 0.1 + crag * 0.5, 0.08 + crag * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); // flat facets: it is meant to look chiselled
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02, flatShading: true }));
    this.group.add(mesh);
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    for (const f of this.flags) {
      f.g.rotation.y = Math.sin(t * 1.4 + f.ph) * 0.3;
      f.g.scale.x = 0.94 + Math.sin(t * 2.6 + f.ph) * 0.06;
    }
    for (const { f, ph, spr } of this.flames) {
      if (f) f.scale.set(1, 0.8 + Math.sin(t * 10 + ph) * 0.3, 1);
      if (spr) spr.material.opacity = 0.55 + Math.sin(t * 9 + ph) * 0.15;
    }
    for (const { g, ph, y } of this.crystals) {
      g.position.y = y + Math.sin(t * 0.6 + ph) * 0.8;
      g.rotation.y = t * 0.5 + ph;
    }
    for (const { m, ph } of this.mists) {
      m.rotation.z = t * 0.012 + ph;
      m.material.opacity = 0.2 + Math.sin(t * 0.25 + ph) * 0.05;
    }
    for (const b of this.birds) {
      b.a += (b.s * dt * 12) / b.r;
      b.g.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.7 + b.ph) * 1.4, b.cz + Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a;
      b.g.rotation.z = Math.sin(t * 6 + b.ph) * 0.5;
    }
  }
}
