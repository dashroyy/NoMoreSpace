// 🗡️ The outside of the Citadel, for the Citadel of Traitors script. The castle stands on a
// floating crag, only just wider than the castle itself, so there is deep space and the Blood
// Moon to look at all round it. A curtain wall with a tower at each corner runs round the
// edge of the crag, a great keep rises behind the Battlements with a beacon fire on its tallest
// turret, and the Banishment Gate opens onto a drawbridge that crosses the void to a small burial
// isle where the banished rest. More rocks drift in the distance, with gold crystals in them,
// mist rolls under everything and ravens circle the towers.
//
// Purely for looks (nobody can walk out here). Only built into the picture while the script is
// the Citadel; the space-station exterior is hidden meanwhile. The burial ground and the dead
// trees are real models (KayKit Halloween Bits, CC0), fetched the first time the castle is shown.
import * as THREE from 'three';
import { M, add, cyl, box, ball, tor, mergeStatic } from './carnival-rooms.js';
import { bannerMat, glowTex, mistTex } from './traitors-rooms.js';
import { loadModels, model } from './assets.js';
import { brickify } from './brick.js';

const Y = -0.9; // just under deck level, like the station's own exterior
const TOP = -0.9; // the top of the crag: a paved courtyard just under the decks
const DSTONE = 0x45414d;
const DWOOD = 0x3d2614;
const WOOD = 0x6b4426;
const IRON = 0x2b2b33;
const GOLD = 0xd9a441;
const SLATE = 0x2f3550;
const WIN = 0xffc060;
const GRAVEYARD = ['crypt', 'gravestone', 'grave_A', 'grave_B', 'gravemarker_A', 'gravemarker_B', 'grave_A_destroyed', 'tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'fence', 'fence_broken', 'fence_pillar', 'post_lantern', 'skull_candle', 'shrine_candles'].map((n) => `halloween/${n}`);

// the main crag: just wider than the castle's rooms and walls
const ISLAND = { cx: 2, cz: 7, rx: 57, rz: 58, depth: 44 };
// the burial isle across the drawbridge, and rocks drifting in the distance
const ISLE = { cx: -92, cz: 0, rx: 19, rz: 17, depth: 16, top: -1.6 };
const ROCKS = [
  { cx: -72, cz: -64, rx: 9, rz: 8, depth: 12 }, { cx: 80, cz: -50, rx: 11, rz: 9, depth: 14 }, { cx: 92, cz: 30, rx: 8, rz: 7, depth: 10 },
  { cx: -68, cz: 76, rx: 10, rz: 9, depth: 12 }, { cx: 36, cz: 90, rx: 9, rz: 8, depth: 11 }, { cx: -26, cz: 104, rx: 6, rz: 6, depth: 9 },
  { cx: 108, cz: -8, rx: 6, rz: 5, depth: 8 }, { cx: -30, cz: -96, rx: 8, rz: 7, depth: 10 },
];

// a cheap smooth noise, good enough to rough up a rock
const n3 = (x, y, z) => Math.sin(x * 1.9 + Math.sin(y * 2.3)) * Math.sin(y * 1.7 + Math.sin(z * 2.1)) * Math.sin(z * 2.3 + Math.sin(x * 1.3));
const SUPER = 3.2; // how square the crag's outline is (2 would be an ellipse)
const rimRadius = (th, rx, rz) => Math.pow(Math.pow(Math.abs(Math.cos(th)) / rx, SUPER) + Math.pow(Math.abs(Math.sin(th)) / rz, SUPER), -1 / SUPER);

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
    this.dressed = false;
    const S = new THREE.Group(); // static pieces, merged at the end
    const base = -2;
    const brick = brickify(new THREE.MeshStandardMaterial({ color: 0x7e7886, roughness: 0.95, metalness: 0.02 }));

    // ---------- the crag, the burial isle and the rocks in the distance ----------
    this.group.add(this.crag({ ...ISLAND, top: TOP, seed: 0 }));
    this.group.add(this.paving());
    this.group.add(this.crag({ ...ISLE, seed: 3 }));
    ROCKS.forEach((r, i) => this.group.add(this.crag({ ...r, top: -2 + (i % 3) * 0.6, seed: i * 1.7 + 5 })));

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
        add(g, box(size, size * 0.9, size * 0.8), brick, x + Math.cos(a) * r, y, z + Math.sin(a) * r, [0, -a, 0]);
      }
    };
    const tower = (x, z, r, h, roof = SLATE, flagIndex = 0, top = 'cone') => {
      add(S, cyl(r * 1.15, r * 1.3, 3.2, 14), M(DSTONE), x, base + 1.4, z);
      add(S, cyl(r, r * 1.06, h, 14), brick, x, base + h / 2 + 1, z);
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
    const wallX = (z, xa, xb, h = 5, t = 1.6) => {
      const len = Math.abs(xb - xa);
      const cx = (xa + xb) / 2;
      add(S, box(len, h, t), brick, cx, base + h / 2 + 1, z);
      add(S, box(len, 0.3, t + 0.5), M(DSTONE), cx, base + h + 1.1, z);
      for (let x = xa + 1; x < xb - 0.5; x += 2.4) add(S, box(1.2, 1.0, t * 0.8), brick, x, base + h + 1.8, z);
    };
    const wallZ = (x, za, zb, h = 5, t = 1.6) => {
      const len = Math.abs(zb - za);
      const cz = (za + zb) / 2;
      add(S, box(t, h, len), brick, x, base + h / 2 + 1, cz);
      add(S, box(t + 0.5, 0.3, len), M(DSTONE), x, base + h + 1.1, cz);
      for (let z = za + 1; z < zb - 0.5; z += 2.4) add(S, box(t * 0.8, 1.0, 1.2), brick, x, base + h + 1.8, z);
    };
    // a straight rod between two points (a chain, a rope)
    const rod = (a, b, r, mat) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 5), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      S.add(m);
    };

    // the curtain wall round the crag's edge, with a tower at each corner
    const W = -52;
    const E = 56;
    const N = -43;
    const SOUTH = 60; // well behind the camera, which hangs south of the player, so the wall never hides the rooms
    wallX(N, W, -10);
    wallX(N, 14, E);
    wallZ(W, -42, -5);
    wallZ(W, 5, 58);
    wallZ(E, -42, 58);
    wallX(SOUTH, W, -12, 3);
    wallX(SOUTH, 12, E, 3);
    tower(W, N, 4.2, 20, 0x5a1a28, 0);
    tower(E, N, 4.2, 22, SLATE, 1);
    tower(W, SOUTH, 3.6, 12, SLATE, 2, 'fire');
    tower(E, SOUTH, 3.6, 12, 0x5a1a28, 1);
    tower(E, -10, 3.2, 17, 0x5a1a28, 0);
    tower(E, 20, 3.0, 14, SLATE, 2);

    // ---------- north: the great keep behind the Battlements ----------
    const KX = 2;
    const KZ = -43;
    add(S, box(24, 27, 9), brick, KX, base + 14.5, KZ);
    add(S, box(25.4, 1.2, 10.4), M(DSTONE), KX, base + 28.6, KZ);
    for (let i = 0; i < 10; i++) for (const sz of [-1, 1]) add(S, box(1.4, 1.1, 1.0), brick, KX - 10.4 + i * 2.3, base + 29.8, KZ + sz * 5);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) add(S, box(0.9, 1.7, 0.3), M(WIN, { e: 1.6 }), KX - 8 + c * 4, base + 8 + r * 5, KZ + 4.6);
    add(S, box(3.4, 5, 0.4), M(DWOOD), KX, base + 3.5, KZ + 4.6); // the great door
    add(S, new THREE.CylinderGeometry(1.7, 1.7, 0.4, 14, 1, false, 0, Math.PI), M(DWOOD), KX, base + 6, KZ + 4.6, [Math.PI / 2, 0, 0]);
    add(S, box(3.7, 0.3, 0.5), M(IRON), KX, base + 5.0, KZ + 4.8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      tower(KX + sx * 12, KZ + sz * 4.5, 2.6, 30 + (sx + sz > 0 ? 4 : 0), SLATE, sx + sz + 3, sx === 1 && sz === -1 ? 'fire' : 'cone');
    }
    flag(KX - 1.5, base + 24, KZ + 4.8, 3, 9, 0);
    // the beacon on the tallest turret throws a slow gold sweep
    const beacon = new THREE.Group();
    beacon.position.set(KX + 12, base + 38.5, KZ - 4.5);
    this.group.add(beacon);
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    wedge.rotation.z = Math.PI / 2;
    wedge.position.x = 4;
    const sweep = new THREE.Group();
    sweep.add(wedge);
    beacon.add(sweep);
    this.anims.push((t, dt) => { sweep.rotation.y += dt * 0.9; });

    // ---------- south: a squat gatehouse (shut) ----------
    for (const sx of [-1, 1]) tower(sx * 9, SOUTH, 3.3, 9, SLATE, 1 + sx);
    add(S, box(14.6, 3, 3.4), brick, 0, base + 8.6, SOUTH);
    add(S, new THREE.CylinderGeometry(3.6, 3.6, 3.6, 14, 1, false, 0, Math.PI), M(0x15101a), 0, base + 4.4, SOUTH + 0.2, [Math.PI / 2, 0, 0]);
    add(S, box(7.2, 3.2, 3.4), M(0x15101a), 0, base + 2.6, SOUTH + 0.2);

    // ---------- west: the Banishment Gate, and the drawbridge across the void to the burial isle ----------
    for (const sz of [-1, 1]) tower(W, sz * 7.2, 3.4, 15, 0x5a1a28, sz > 0 ? 0 : 1);
    add(S, box(4, 3.2, 14.4), brick, W, base + 14.6, 0);
    add(S, new THREE.CylinderGeometry(6.2, 6.2, 4, 18, 1, false, 0, Math.PI), M(0x15080a), W, base + 6, 0, [Math.PI / 2, 0, Math.PI / 2]);
    add(S, box(0.4, 0.5, 4), M(0x8a1a22, { e: 0.35 }), W - 0.3, base + 3.2, 0); // a red glow in the gate
    const bridgeLen = 21;
    add(S, box(bridgeLen, 0.4, 3.8), M(WOOD), W - bridgeLen / 2, Y - 0.1, 0);
    for (let k = 0; k < 14; k++) add(S, box(0.12, 0.05, 3.8), M(DWOOD), W - 0.8 - k * 1.5, Y + 0.13, 0);
    for (const sz of [-1, 1]) {
      add(S, box(bridgeLen, 0.6, 0.3), M(DWOOD), W - bridgeLen / 2, Y + 0.3, sz * 2.0);
      for (let k = 0; k < 8; k++) add(S, cyl(0.05, 0.05, 0.9, 4), M(IRON), W - 1.5 - k * 2.6, Y + 0.7, sz * 2.0);
      // the chains that hold the bridge up
      rod(new THREE.Vector3(W - bridgeLen + 0.4, Y + 0.4, sz * 1.9), new THREE.Vector3(W - 0.5, base + 12, sz * 1.9), 0.07, M(IRON));
    }
    add(S, cyl(0.15, 0.15, 3.2, 6), M(DWOOD), W - bridgeLen, Y + 1.0, -2); // a post at the far end, with a red lantern
    add(S, cyl(0.15, 0.15, 3.2, 6), M(DWOOD), W - bridgeLen, Y + 1.0, 2);
    const lantern = add(this.group, ball(0.22, 8), glowing(0xff3a3a, 1.8), W - bridgeLen, Y + 2.9, 2);
    this.anims.push((t) => lantern.scale.setScalar(0.85 + Math.sin(t * 7) * 0.12 + Math.sin(t * 2.3) * 0.08));

    // ---------- gold crystals in the rock, and floating about it ----------
    const gold = glowing(0xffd23f, 0.9);
    const goldDeep = glowing(0xe0902a, 0.7);
    this.crystals = [];
    const clusters = lowFx ? 7 : 14;
    for (let i = 0; i < clusters; i++) {
      const th = (i / clusters) * Math.PI * 2 + 0.3;
      const rho = rimRadius(th, ISLAND.rx, ISLAND.rz) * 0.9;
      const cx = ISLAND.cx + Math.cos(th) * rho;
      const cz = ISLAND.cz + Math.sin(th) * rho;
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.7 + (k % 2) * 0.4, 3.5 + k * 1.2, 5), k % 2 ? gold : goldDeep);
        c.position.set(cx + Math.cos(k * 1.7) * 1.6, -9 - (i % 4) * 4 + k * 0.7, cz + Math.sin(k * 1.7) * 1.6);
        c.rotation.set(Math.sin(k + i) * 0.5, 0, Math.cos(k * 2 + i) * 0.5 + (Math.cos(th) > 0 ? -0.9 : 0.9));
        this.group.add(c);
      }
    }
    for (let i = 0; i < (lowFx ? 6 : 14); i++) {
      const g = new THREE.Group();
      const th = Math.random() * Math.PI * 2;
      const rho = rimRadius(th, ISLAND.rx, ISLAND.rz) * (1.2 + Math.random() * 0.5);
      g.position.set(ISLAND.cx + Math.cos(th) * rho, 3 + Math.random() * 9, ISLAND.cz + Math.sin(th) * rho);
      add(g, new THREE.OctahedronGeometry(0.5 + Math.random() * 0.3), gold, 0, 0, 0, null, [0.7, 1.4, 0.7]);
      this.group.add(g);
      this.crystals.push({ g, ph: Math.random() * 6, y: g.position.y });
    }
    for (const r of ROCKS) {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 + (k % 2) * 0.3, 2.4 + k * 0.9, 5), k % 2 ? gold : goldDeep);
        c.position.set(r.cx + (k - 1) * r.rx * 0.35, -1.2 + k * 0.3, r.cz + (k % 2 ? 1 : -1) * r.rz * 0.3);
        c.rotation.set(Math.sin(k + r.cx) * 0.3, 0, Math.cos(k * 2 + r.cz) * 0.3);
        this.group.add(c);
      }
    }

    // ---------- mist under the crags ----------
    this.mists = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(300 - i * 50, 300 - i * 50), new THREE.MeshBasicMaterial({ map: mistTex(), color: i === 1 ? 0xc06070 : 0x9a8ab0, transparent: true, opacity: 0.2, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(2, -22 - i * 7, 3);
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
      const home = i % 2 ? [KX, KZ] : [E, N];
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

  // a floating crag: a flat top just under the decks (or wherever `top` says), a rugged edge, and a
  // point hanging below. Dark rock, with a little warmth where the Blood Moon's light reaches it.
  crag({ cx, cz, rx, rz, depth, top = TOP, seed = 0 }) {
    const geo = new THREE.IcosahedronGeometry(1, this.lowFx ? 4 : 5).toNonIndexed();
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const len = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)) || 1;
      const x = pos.getX(i) / len;
      const y = pos.getY(i) / len;
      const z = pos.getZ(i) / len;
      const r = Math.hypot(x, z);
      const th = Math.atan2(z, x);
      const rho = rimRadius(th, rx, rz);
      // the same vertex must land in the same place wherever it is shared: a pure function of its direction
      const rough = n3(x * 3 + seed, y * 3, z * 3) * 0.12 + n3(x * 7, y * 7 + 2 + seed, z * 7) * 0.05 + n3(x * 15, y * 15, z * 15 + 4) * 0.02;
      let hs;
      let py;
      if (y >= 0) {
        hs = r * (1 + rough * (0.3 + 0.7 * r));
        const rim = Math.max(0, Math.min(1, (r - 0.7) / 0.3)); // flat in the middle, rugged at the edge
        py = top + y * 0.3 + rough * (0.15 + 2.6 * rim * rim);
      } else {
        const t = -y;
        hs = Math.pow(r, 0.85) * (1 - 0.4 * t) * (1 + rough * 1.4);
        py = top - Math.pow(t, 0.9) * depth * (1 + rough * 1.6);
      }
      pos.setXYZ(i, cx + Math.cos(th) * rho * hs, py, cz + Math.sin(th) * rho * hs);
      const tt = Math.max(0, Math.min(1, -y));
      const v = 0.8 + rough * 2.2;
      if (y > 0.15) c.setRGB(0.17 * v, 0.158 * v, 0.19 * v); // the flat top
      else c.setRGB((0.3 - tt * 0.15) * v, (0.24 - tt * 0.13) * v, (0.28 - tt * 0.12) * v); // the sides: bruised rock, darker towards the tip
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); // flat facets: it is meant to look chiselled
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02, flatShading: true }));
  }

  // flagstones over the castle's courtyard, so the ground between the rooms is paved, not bare rock
  paving() {
    const { cx, cz, rx, rz } = ISLAND;
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const th = (i / 96) * Math.PI * 2;
      const rho = rimRadius(th, rx, rz) * 0.9;
      pts.push(new THREE.Vector2(cx + Math.cos(th) * rho, -(cz + Math.sin(th) * rho)));
    }
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateX(-Math.PI / 2);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#34313c';
    g.fillRect(0, 0, 256, 256);
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let row = 0; row < 8; row++) {
      let x = -rnd() * 30;
      while (x < 256) {
        const w = 24 + rnd() * 26;
        const v = 74 + Math.floor(rnd() * 38);
        g.fillStyle = `rgb(${v},${v - 3},${v + 6})`;
        g.fillRect(x + 1.5, row * 32 + 1.5, w - 3, 29);
        x += w;
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.repeat.set(1 / 6, 1 / 6); // shape UVs are in metres: one tile every 6 m
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.02 }));
    mesh.position.y = TOP + 0.3;
    return mesh;
  }

  // the burial isle: where the banished rest, across the drawbridge
  async dress() {
    this.dressed = true;
    await loadModels(GRAVEYARD);
    const S = new THREE.Group();
    const put = (name, x, z, { s = 1, ry = 0, y = -1.3 } = {}) => {
      const m = model(`halloween/${name}`);
      if (!m) return;
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.scale.setScalar(s);
      S.add(m);
    };
    const stones = ['gravestone', 'grave_A', 'gravemarker_A', 'grave_B', 'gravemarker_B', 'gravestone', 'grave_A_destroyed', 'gravemarker_A'];
    let k = 0;
    for (const side of [-1, 1]) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const name = stones[k % stones.length];
          put(name, -99 + c * 4.4 + (r % 2) * 1.2, side * (5.6 + r * 3.8), { s: name.startsWith('grave_') ? 1.1 : 1.6, ry: (((k * 37) % 9) - 4) * 0.05 });
          k++;
        }
      }
    }
    put('crypt', -100, -13.5, { s: 1.15 });
    put('shrine_candles', -80.5, 7.5, { s: 1.5 });
    put('post_lantern', -76.5, -3.2, { s: 0.6 });
    put('post_lantern', -76.5, 3.2, { s: 0.6, ry: Math.PI });
    for (const x of [-98, -94, -90, -86]) put('fence', x, 13.6, { s: 1.0 });
    put('fence_pillar', -100, 13.6);
    put('fence_pillar', -84, 13.6);
    put('tree_dead_large', -84.5, -12.5, { s: 1.7 });
    put('tree_dead_medium', -106, 8, { s: 1.6, ry: 1.2 });
    put('tree_dead_small', -91, 13.2, { s: 1.8, ry: 0.4 });
    put('skull_candle', -80, -6.5, { s: 0.8 });
    // a dead tree or two on the drifting rocks
    ROCKS.forEach((r, i) => put(['tree_dead_large', 'tree_dead_medium', 'tree_dead_small'][i % 3], r.cx, r.cz, { s: 1.5 + (i % 2) * 0.4, ry: i, y: -1.6 + (i % 3) * 0.6 }));
    this.group.add(mergeStatic(S));
    S.clear();
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
    if (on && !this.dressed) this.dress();
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
      m.material.opacity = 0.18 + Math.sin(t * 0.25 + ph) * 0.05;
    }
    for (const b of this.birds) {
      b.a += (b.s * dt * 12) / b.r;
      b.g.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.7 + b.ph) * 1.4, b.cz + Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a;
      b.g.rotation.z = Math.sin(t * 6 + b.ph) * 0.5;
    }
  }
}
