// 🗡️ The Citadel of Traitors' rooms. While a ship plays that script, the station is
// a haunted castle (the space-station props are hidden, see ship.setTheme): the Round
// Table under a gold-and-crimson floor crest, a Battlements with a creaking trebuchet,
// a Library of floating books and a ticking grandfather clock, a Bell Tower with a
// bell that tolls, an Apothecary of bubbling potions, a Banquet Hall laid for a feast,
// the Great Hearth with a sleeping hound, a Dungeon with a swinging gibbet, a Walled
// Garden with a fountain and fireflies, the Banishment Gate with its portcullis and
// red carpet, Bedchambers with four-poster beds and a Wine Cellar of barrels. Torches
// burn along every north wall, banners hang between them, embers drift up and ravens
// circle over the Round Table.
//
// Everything is made of simple shapes and canvas patterns (no image files). Pieces
// that never move are merged into a few meshes per material; flames, the trebuchet,
// bell, clock pendulum, gibbet, fountain, books and ravens are animated. Purely for
// looks: nothing here blocks anyone.
import * as THREE from 'three';
import { ROOMS, CORRIDORS, roomOutline, chamferOf } from './layout.js';
import { M, T, add, cyl, box, ball, tor, mergeStatic } from './carnival-rooms.js';

const STONE = 0x6a6672;
const DSTONE = 0x45414d;
const WOOD = 0x6b4426;
const DWOOD = 0x3d2614;
const IRON = 0x2b2b33;
const GOLD = 0xd9a441;
const CRIMSON = 0xa3162b;
const PARCH = 0xf0e2bd;
const FIRE = 0xffa43a;
const BRONZE = 0xb8803a;

// the point light in each room takes on a candle, moon or potion colour
export const TRAITORS_LIGHTS = {
  bridge: 0xffb066, observation: 0x9bb8ff, navigation: 0xffc27a, comms: 0xffd27a, medbay: 0x9bffb0, galley: 0xff9a5a,
  reactor: 0xff6a2a, engine: 0x8f9fd0, hydroponics: 0xa8ffc8, airlock: 0xff3a3a, quarters: 0xd0a0ff, cargo: 0xd0805a,
};

const FLOORS = {
  observation: ['checker', 0x4a4852, 0x3c3a44], navigation: ['stripes', 0x5a3a22, 0x4a2e1a], comms: ['checker', 0x544e48, 0x423d38], medbay: ['checker', 0x3a4a3c, 0x2e3a30],
  galley: ['checker', 0x6a2a2e, 0x2a1a1c], reactor: ['checker', 0x3c3232, 0x2c2424], engine: ['checker', 0x2e2e34, 0x232329], hydroponics: ['dots', 0x2f5a2a, 0x4a7a38],
  airlock: ['diag', 0x2a2a30, 0x4a1a1e], quarters: ['stripes', 0x6a4a2a, 0x5a3c22], cargo: ['checker', 0x3a2c24, 0x2e2018], bridge: null,
};

// ---------- canvas-drawn materials (cached) ----------
const drawnMats = new Map();
function drawn(key, w, h, draw, extra = {}) {
  if (!drawnMats.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    drawnMats.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.02, ...extra }));
  }
  return drawnMats.get(key);
}

// a hanging banner with a swallow-tail, a gold border and an emblem
function bannerMat(i) {
  const bg = ['#a3162b', '#14101c', '#3a1a5a'][i % 3];
  const emblem = ['dagger', 'raven', 'crown'][i % 3];
  return drawn(`banner|${i % 3}`, 128, 256, (g, w, h) => {
    g.beginPath();
    g.moveTo(6, 4);
    g.lineTo(w - 6, 4);
    g.lineTo(w - 6, h - 46);
    g.lineTo(w / 2, h - 8);
    g.lineTo(6, h - 46);
    g.closePath();
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = '#d9a441';
    g.lineWidth = 7;
    g.stroke();
    g.fillStyle = '#d9a441';
    g.strokeStyle = '#d9a441';
    g.translate(w / 2, 108);
    if (emblem === 'dagger') {
      g.beginPath();
      g.moveTo(0, -70);
      g.lineTo(11, -4);
      g.lineTo(0, 12);
      g.lineTo(-11, -4);
      g.closePath();
      g.fill();
      g.fillRect(-30, 10, 60, 8);
      g.fillRect(-4, 18, 8, 34);
      g.beginPath();
      g.arc(0, 58, 8, 0, Math.PI * 2);
      g.fill();
    } else if (emblem === 'raven') {
      g.beginPath();
      g.ellipse(0, 6, 26, 36, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(0, -36, 15, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(12, -38);
      g.lineTo(34, -32);
      g.lineTo(12, -28);
      g.fill();
      g.beginPath();
      g.moveTo(-18, 6);
      g.lineTo(-54, -24);
      g.lineTo(-30, 30);
      g.fill();
      g.beginPath();
      g.moveTo(18, 6);
      g.lineTo(54, -24);
      g.lineTo(30, 30);
      g.fill();
      g.fillStyle = bg;
      g.beginPath();
      g.arc(4, -38, 3.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.moveTo(-40, 30);
      g.lineTo(-40, -22);
      g.lineTo(-20, 0);
      g.lineTo(0, -40);
      g.lineTo(20, 0);
      g.lineTo(40, -22);
      g.lineTo(40, 30);
      g.closePath();
      g.fill();
      g.fillRect(-40, 34, 80, 10);
    }
  }, { alphaTest: 0.5, side: THREE.DoubleSide });
}

// a shelf front: dark wood with rows of book spines
const shelfMat = () => drawn('shelf', 256, 256, (g, w, h) => {
  g.fillStyle = '#2e1b0e';
  g.fillRect(0, 0, w, h);
  const cols = ['#8a1c2c', '#2c4a7a', '#2f6a3c', '#b8883a', '#5a2a6a', '#7a4a22', '#c9c2a8', '#1c3a3a'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let row = 0; row < 4; row++) {
    const y0 = 10 + row * 61;
    let x = 8;
    while (x < w - 14) {
      const bw = 8 + Math.floor(rnd() * 10);
      const bh = 36 + Math.floor(rnd() * 16);
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(x, y0 + 50 - bh, bw, bh);
      g.fillStyle = 'rgba(255,225,150,0.5)';
      g.fillRect(x + 1, y0 + 50 - bh + 6, bw - 2, 2);
      x += bw + 1;
    }
    g.fillStyle = '#4a2c14';
    g.fillRect(0, y0 + 50, w, 9);
  }
});

// the Round Table's floor crest: a ring of gold with crimson and dark wedges and a star
const crestMat = () => {
  if (drawnMats.has('crest')) return drawnMats.get('crest');
  const mat = drawn('crest', 1024, 1024, (g) => {
    const c = 512;
    g.fillStyle = 'rgba(18,10,16,0.62)';
    g.beginPath();
    g.arc(c, c, 506, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2;
      const a1 = ((k + 1) / 16) * Math.PI * 2;
      g.fillStyle = k % 2 ? 'rgba(130,20,34,0.62)' : 'rgba(34,22,48,0.6)';
      g.beginPath();
      g.arc(c, c, 470, a0, a1);
      g.arc(c, c, 345, a1, a0, true);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#d9a441';
    for (const [r, lw] of [[496, 10], [476, 3], [340, 6], [322, 2]]) {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    // an eight-pointed star
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 150 : 310;
      g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(c, c, 120, 0, Math.PI * 2);
    g.stroke();
  }, { transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return mat;
};

// a globe: blue seas and green and brown lands
const globeMat = () => drawn('globe', 256, 128, (g, w, h) => {
  g.fillStyle = '#2c5a8a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#5a8a4a';
  for (const [x, y, rx, ry] of [[50, 50, 30, 24], [120, 40, 24, 30], [180, 70, 34, 18], [90, 95, 18, 14], [225, 40, 16, 12]]) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#c9b480';
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
});

const glowTex = (() => {
  let tex = null;
  return () => {
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,200,110,0.9)');
      grad.addColorStop(0.35, 'rgba(255,140,50,0.35)');
      grad.addColorStop(1, 'rgba(255,100,20,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  };
})();

const mistTex = (() => {
  let tex = null;
  return () => {
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(200,205,225,0.9)');
      grad.addColorStop(0.55, 'rgba(160,165,190,0.35)');
      grad.addColorStop(1, 'rgba(120,120,160,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  };
})();

const glass = (color = 0x9bffb0, o = 0.4) => M(color, { o, r: 0.05, e: 0.5 });
const liquid = (color) => M(color, { e: 1.0, o: 0.85, r: 0.25 });
const RUG = new THREE.MeshStandardMaterial({ color: CRIMSON, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const RUG_TRIM = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const RUG_PURPLE = new THREE.MeshStandardMaterial({ color: 0x3a1a5a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

// a barrel: bulging in the middle
const BARREL = (() => {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(new THREE.Vector2(0.42 + Math.sin(u * Math.PI) * 0.14, (u - 0.5) * 1.0));
  }
  return new THREE.LatheGeometry(pts, 14);
})();

export { bannerMat, glowTex, mistTex };

export class TraitorsRooms {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.lowFx = lowFx;
    this.anims = [];
    this.flames = [];
    this.flameGroup = new THREE.Group();
    this.group.add(this.flameGroup);
    this.flameMat = M(FIRE, { e: 2.2, o: 0.95 });
    this.flameMat2 = M(0xffe08a, { e: 2.4, o: 0.95 });
    const still = new THREE.Group();
    this.floors(still);
    this.walls(still);
    for (const room of ROOMS) {
      const [x0, z0, x1, z1] = room.rect;
      const R = { room, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
      R.at = (x, y, z, ry = 0, live = false) => {
        const g = new THREE.Group();
        g.position.set(R.cx + x, y, R.cz + z);
        g.rotation.y = ry;
        (live ? this.group : still).add(g);
        return g;
      };
      R.s = R.at(0, 0, 0);
      this.torches(R);
      const dress = this[`room_${room.id}`];
      if (dress) dress.call(this, R);
    }
    this.embers();
    this.mist();
    this.ravens();
    this.group.add(mergeStatic(still));
    still.clear();
  }

  // ---------- fire ----------
  // a flickering flame (and a warm glow behind it) at a spot in a room
  flame(R, x, y, z, s = 1, halo = false) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.34 * s, 6), s > 0.9 ? this.flameMat : this.flameMat2);
    m.position.set(R.cx + x, y, R.cz + z);
    this.flameGroup.add(m);
    const f = { m, s, ph: Math.random() * 10, y };
    if (halo) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      spr.position.set(R.cx + x, y + 0.1 * s, R.cz + z);
      spr.scale.setScalar(1.8 * s);
      this.flameGroup.add(spr);
      f.halo = spr;
    }
    this.flames.push(f);
    return f;
  }

  candle(R, x, y, z, h = 0.26) {
    add(R.s, cyl(0.04, 0.045, h, 6), M(PARCH, { r: 0.8 }), x, y + h / 2, z);
    this.flame(R, x, y + h + 0.14, z, 0.6);
  }

  brazier(R, x, z, s = 1) {
    const g = R.s;
    add(g, cyl(0.46 * s, 0.22 * s, 0.34 * s, 10), M(IRON, { r: 0.5 }), x, 0.82 * s, z);
    add(g, tor(0.46 * s, 0.04 * s, 12), M(IRON), x, 0.99 * s, z, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      add(g, cyl(0.03 * s, 0.045 * s, 0.7 * s, 5), M(IRON), x + Math.cos(a) * 0.26 * s, 0.35 * s, z + Math.sin(a) * 0.26 * s, [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2]);
    }
    add(g, cyl(0.4 * s, 0.4 * s, 0.05, 10), M(0xff5a1a, { e: 1.3 }), x, 0.98 * s, z);
    this.flame(R, x, 1.2 * s, z, 1.7 * s, true);
    this.flame(R, x + 0.15 * s, 1.1 * s, z - 0.1 * s, 1.1 * s);
  }

  // ---------- floors, corridor flagstones ----------
  floors(parent) {
    for (const room of ROOMS) {
      const spec = FLOORS[room.id];
      if (!spec) continue;
      const [kind, c1, c2] = spec;
      const shape = new THREE.Shape(roomOutline(room.rect).map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, T(kind, c1, c2, 0.5, 0.5, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mesh.position.y = 0.008;
      parent.add(mesh);
    }
    // the hub: the Round Table's crest
    const hub = new THREE.Mesh(new THREE.PlaneGeometry(19, 19), crestMat());
    hub.rotation.x = -Math.PI / 2;
    hub.position.set(0, 0.015, 0);
    this.group.add(hub);
    for (const [x0, z0, x1, z1] of CORRIDORS) {
      const mat = T('checker', 0x3a3a44, 0x2e2e38, (x1 - x0) / 1.4, (z1 - z0) / 1.4, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0.009, (z0 + z1) / 2);
      parent.add(mesh);
    }
  }

  // ---------- banners along every north wall ----------
  walls(parent) {
    ROOMS.forEach((room, ri) => {
      const [x0, z0, x1] = room.rect;
      const w = x1 - x0;
      const xs = w >= 20 ? [-3.6, 3.6] : w >= 16 ? [-4.5, 4.5] : w >= 12 ? [-2.6, 2.6] : [0];
      xs.forEach((x, i) => {
        add(parent, box(0.9, 1.8, 0.04), bannerMat(ri + i), (x0 + x1) / 2 + x, 1.3, z0 + 0.62);
        add(parent, cyl(0.03, 0.03, 1.1, 5), M(GOLD, { r: 0.4 }), (x0 + x1) / 2 + x, 2.2, z0 + 0.62, [0, 0, Math.PI / 2]);
      });
    });
  }

  // a torch on the north wall at each end of the straight stretch
  torches(R) {
    const [x0, z0, x1] = R.room.rect;
    const half = (x1 - x0) / 2 - chamferOf(R.room.rect) - 0.5;
    for (const x of [-half, half]) {
      add(R.s, box(0.14, 0.32, 0.14), M(IRON, { r: 0.5 }), x, 1.55, -(R.room.rect[3] - z0) / 2 + 0.7);
      add(R.s, cyl(0.04, 0.05, 0.5, 5), M(DWOOD), x, 1.8, -(R.room.rect[3] - z0) / 2 + 0.72);
      this.flame(R, x, 2.15, -(R.room.rect[3] - z0) / 2 + 0.72, 1.1, true);
    }
  }

  // ---------- embers, mist, ravens ----------
  embers() {
    const n = this.lowFx ? 60 : 130;
    this.emberPos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.emberData = [];
    for (let i = 0; i < n; i++) {
      const room = ROOMS[i % ROOMS.length];
      const [x0, z0, x1, z1] = room.rect;
      this.emberData.push({ x: x0 + Math.random() * (x1 - x0), y: Math.random() * 3.5, z: z0 + Math.random() * (z1 - z0), speed: 0.18 + Math.random() * 0.4, sway: Math.random() * 6 });
      const c = new THREE.Color([0xffa43a, 0xffd27a, 0xff6a3a][i % 3]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.emberPoints = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.emberPoints.frustumCulled = false;
    this.group.add(this.emberPoints);
  }

  // low-lying mist in the damp rooms
  mist() {
    this.mists = [];
    const spots = [[0, 0, 22], [-26, 0, 0], [0, 25, 18], [26, 24, 13], [-44, 0, 9], [0, 43, 17], [-26, -24, 12]];
    spots.forEach(([x, z, size], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: mistTex(), transparent: true, opacity: this.lowFx ? 0.12 : 0.2, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.16 + i * 0.01, z);
      this.group.add(m);
      this.mists.push({ m, ph: i * 1.7 });
    });
  }

  // ravens circling over the Round Table
  ravens() {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -0.5, 0.12, -0.2, -0.12, 0, 0.3, 0, 0, 0, 0.5, 0.12, -0.2, 0.12, 0, 0.3]), 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a070c, side: THREE.DoubleSide });
    this.birds = [];
    for (let i = 0; i < (this.lowFx ? 3 : 7); i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat);
      body.scale.set(0.6, 0.5, 1.3);
      g.add(body, new THREE.Mesh(wing, mat));
      this.group.add(g);
      this.birds.push({ g, a: Math.random() * 6.28, r: 11 + Math.random() * 6, y: 4.5 + Math.random() * 2.5, s: 0.35 + Math.random() * 0.25, ph: Math.random() * 6 });
    }
  }

  // an armour stand: a suit of plate with a plume and a spear
  armour(R, x, z, ry = 0) {
    const g = R.at(x, 0, z, ry);
    const steel = M(0x9aa4b2, { r: 0.35 });
    for (const s of [-1, 1]) add(g, box(0.18, 0.8, 0.2), steel, s * 0.14, 0.4, 0);
    add(g, box(0.56, 0.7, 0.3), steel, 0, 1.15, 0);
    add(g, ball(0.2, 10), steel, 0, 1.7, 0);
    add(g, box(0.3, 0.05, 0.05), M(0x15151a), 0, 1.72, 0.18);
    add(g, new THREE.ConeGeometry(0.05, 0.3, 5), M(CRIMSON), 0, 2.0, 0);
    for (const s of [-1, 1]) add(g, ball(0.14, 8), steel, s * 0.36, 1.45, 0);
    add(g, cyl(0.02, 0.02, 2.3, 5), M(DWOOD), 0.42, 1.15, 0.05);
    add(g, new THREE.ConeGeometry(0.06, 0.25, 5), steel, 0.42, 2.4, 0.05);
    add(g, box(0.7, 0.1, 0.5), M(DSTONE), 0, 0.05, 0);
  }

  bookshelf(s, x, z, w = 3.4, h = 2.3) {
    add(s, box(w, h, 0.7), shelfMat(), x, h / 2, z);
    add(s, box(w + 0.1, 0.1, 0.8), M(DWOOD), x, h + 0.05, z);
  }

  pillar(s, x, z, h = 2.3) {
    add(s, cyl(0.34, 0.4, 0.3, 10), M(DSTONE), x, 0.15, z);
    add(s, cyl(0.26, 0.3, h - 0.5, 10), M(STONE), x, h / 2, z);
    add(s, cyl(0.38, 0.28, 0.3, 10), M(DSTONE), x, h - 0.15, z);
  }

  // ---------- 🗡️ Bridge → The Round Table ----------
  room_bridge(R) {
    const s = R.s;
    // twelve candles on the table's edge
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.candle(R, Math.cos(a) * 2.7, 0.9, Math.sin(a) * 2.7, 0.22);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) this.pillar(s, sx * 8.4, sz * 8.4);
      this.brazier(R, sx * 6.0, 8.8);
    }
    // crests on the north wall: a shield over crossed swords
    for (const x of [-5.4, 5.4]) {
      add(s, cyl(0.5, 0.5, 0.06, 6), M(CRIMSON), x, 1.7, -9.55, [Math.PI / 2, 0, 0]);
      add(s, box(0.12, 0.7, 0.04), M(GOLD, { r: 0.35 }), x, 1.7, -9.5);
      add(s, box(0.6, 0.12, 0.04), M(GOLD, { r: 0.35 }), x, 1.75, -9.5);
      for (const r of [0.7, -0.7]) add(s, box(0.08, 1.5, 0.03), M(0xb8c0cc, { r: 0.3 }), x, 1.7, -9.45, [0, 0, r]);
    }
  }

  // ---------- 🔭 Observation Deck → The Battlements ----------
  room_observation(R) {
    const s = R.s;
    add(s, box(16, 0.5, 0.7), M(STONE), 0, 0.25, -7.2);
    for (let i = 0; i < 9; i++) add(s, box(1.0, 0.6, 0.7), M(STONE), -7.2 + i * 1.8, 0.8, -7.2);
    // a trebuchet
    const base = R.at(-4.6, 0, 1.4);
    for (const sz of [-1, 1]) {
      add(base, box(0.2, 2.6, 0.2), M(DWOOD), -0.6, 1.1, sz * 0.9, [0, 0, 0.22]);
      add(base, box(0.2, 2.6, 0.2), M(DWOOD), 0.6, 1.1, sz * 0.9, [0, 0, -0.22]);
    }
    add(base, box(3.0, 0.2, 0.2), M(DWOOD), 0, 0.1, -0.9);
    add(base, box(3.0, 0.2, 0.2), M(DWOOD), 0, 0.1, 0.9);
    add(base, cyl(0.07, 0.07, 2.2, 6), M(IRON), 0, 2.3, 0, [Math.PI / 2, 0, 0]);
    const arm = R.at(-4.6, 2.3, 1.4, 0, true);
    const pivot = new THREE.Group();
    arm.add(pivot);
    add(pivot, box(0.2, 0.2, 4.4), M(WOOD), 0, 0, 0.7);
    add(pivot, box(0.7, 0.8, 0.7), M(IRON, { r: 0.5 }), 0, -0.5, -1.2);
    add(pivot, ball(0.28, 8), M(STONE), 0, 0.15, 2.9);
    this.anims.push((t) => { pivot.rotation.x = Math.sin(t * 0.35) * 0.18; });
    // cannonballs, a spyglass and a flagpole
    [[0, 0], [0.5, 0], [-0.5, 0], [0.25, 0.5], [-0.25, 0.5], [0, 1.0]].forEach(([x, y], i) => add(s, ball(0.25, 8), M(IRON, { r: 0.4 }), 4.8 + x * (i > 4 ? 0 : 1), 0.25 + (i > 2 ? (i > 4 ? 0.7 : 0.45) : 0), 3.2 + (i > 2 ? 0.1 : 0)));
    for (let i = 0; i < 3; i++) add(s, cyl(0.03, 0.03, 1.3, 5), M(DWOOD), 1.6 + Math.cos(i * 2.1) * 0.4, 0.65, 3.8 + Math.sin(i * 2.1) * 0.4, [Math.sin(i * 2.1) * 0.25, 0, -Math.cos(i * 2.1) * 0.25]);
    add(s, cyl(0.1, 0.13, 0.9, 8), M(BRONZE, { r: 0.3 }), 1.6, 1.5, 3.8, [0.7, 0, 0]);
    add(s, cyl(0.045, 0.045, 3.4, 6), M(DWOOD), 7.4, 1.7, 4.4);
    add(s, ball(0.1, 6), M(GOLD), 7.4, 3.45, 4.4);
    const flag = R.at(7.4, 2.9, 4.4, 0, true);
    add(flag, box(1.6, 0.9, 0.04), bannerMat(0), 0.82, 0, 0);
    this.anims.push((t) => { flag.rotation.y = Math.sin(t * 1.3) * 0.22; });
    this.brazier(R, -7.5, -6.2);
    this.brazier(R, 7.5, -6.2);
  }

  // ---------- 📚 Navigation → The Library ----------
  room_navigation(R) {
    const s = R.s;
    for (const x of [-3.8, -0.4]) this.bookshelf(s, x, -5.3, 3.2);
    for (const sx of [-1, 1]) add(s, box(0.7, 2.3, 4.2), shelfMat(), sx * 7.5, 1.15, 0.6);
    // a ladder
    for (const dx of [-0.25, 0.25]) add(s, box(0.06, 2.4, 0.06), M(WOOD), -3.6 + dx, 1.15, -4.7, [0.18, 0, 0]);
    for (let i = 0; i < 5; i++) add(s, box(0.5, 0.05, 0.05), M(WOOD), -3.6, 0.35 + i * 0.45, -4.78 + i * 0.07);
    // the grandfather clock
    add(s, box(0.8, 2.3, 0.6), M(DWOOD), 3.2, 1.15, -5.3);
    add(s, cyl(0.28, 0.28, 0.05, 16), M(PARCH), 3.2, 1.85, -4.98, [Math.PI / 2, 0, 0]);
    add(s, box(0.04, 0.22, 0.03), M(IRON), 3.2, 1.93, -4.94);
    add(s, box(0.16, 0.04, 0.03), M(IRON), 3.26, 1.85, -4.94);
    add(s, box(0.5, 0.9, 0.04), glass(0x6a5a3a, 0.35), 3.2, 0.75, -4.98);
    const pend = R.at(3.2, 1.15, -4.93, 0, true);
    add(pend, cyl(0.012, 0.012, 0.7, 4), M(GOLD), 0, -0.3, 0);
    add(pend, cyl(0.1, 0.1, 0.03, 10), M(GOLD, { e: 0.4 }), 0, -0.68, 0, [Math.PI / 2, 0, 0]);
    this.anims.push((t) => { pend.rotation.z = Math.sin(t * 3.1) * 0.35; });
    // a globe on a stand
    add(s, cyl(0.06, 0.1, 0.9, 6), M(BRONZE, { r: 0.35 }), 5.5, 0.45, 2.5);
    add(s, cyl(0.4, 0.3, 0.06, 10), M(BRONZE), 5.5, 0.03, 2.5);
    const globe = R.at(5.5, 1.3, 2.5, 0, true);
    add(globe, new THREE.SphereGeometry(0.48, 18, 12), globeMat(), 0, 0, 0);
    add(globe, tor(0.56, 0.025, 20), M(BRONZE, { r: 0.3 }), 0, 0, 0, [Math.PI / 2, 0.3, 0]);
    this.anims.push((t, dt) => { globe.rotation.y += dt * 0.4; });
    // a reading desk with an open book that glows
    add(s, box(1.2, 0.1, 0.8), M(WOOD), -5.5, 1.0, 2.5, [0.18, 0, 0]);
    add(s, box(0.12, 1.0, 0.12), M(DWOOD), -5.5, 0.5, 2.5);
    add(s, box(0.5, 0.04, 0.4), M(PARCH, { e: 0.45 }), -5.72, 1.12, 2.46, [0.18, 0, 0.05]);
    add(s, box(0.5, 0.04, 0.4), M(PARCH, { e: 0.45 }), -5.28, 1.12, 2.46, [0.18, 0, -0.05]);
    // candles and books drifting in the air
    this.float = [];
    [[-5.5, 1.9, 2.5], [-4.2, 2.3, 0.4], [-6.4, 2.1, -0.6]].forEach(([x, y, z], i) => {
      const c = R.at(x, y, z, 0, true);
      add(c, cyl(0.04, 0.04, 0.26, 6), M(PARCH), 0, 0, 0);
      this.flame(R, x, y + 0.27, z, 0.6);
      this.float.push({ g: c, y, ph: i * 2, flame: this.flames[this.flames.length - 1] });
    });
    [[-1.2, 2.2, 1.4], [2.4, 1.8, -1.0], [3.8, 2.4, 0.8]].forEach(([x, y, z], i) => {
      const b = R.at(x, y, z, i, true);
      const l = new THREE.Group();
      const r = new THREE.Group();
      add(l, box(0.34, 0.03, 0.44), M([0x8a1c2c, 0x2c4a7a, 0x5a2a6a][i]), -0.17, 0, 0);
      add(r, box(0.34, 0.03, 0.44), M([0x8a1c2c, 0x2c4a7a, 0x5a2a6a][i]), 0.17, 0, 0);
      b.add(l, r);
      this.float.push({ g: b, y, ph: i * 1.3 + 5, wings: [l, r] });
    });
  }

  // ---------- 🔔 Comms → The Bell Tower ----------
  room_comms(R) {
    const s = R.s;
    for (const sx of [-1, 1]) add(s, box(0.3, 3.2, 0.3), M(DWOOD), -4.5 + sx * 1.6, 1.6, -3.3);
    add(s, box(3.9, 0.3, 0.3), M(DWOOD), -4.5, 3.1, -3.3);
    const bell = R.at(-4.5, 2.95, -3.3, 0, true);
    const sw = new THREE.Group();
    bell.add(sw);
    add(sw, cyl(0.28, 0.85, 1.3, 14), M(BRONZE, { r: 0.3 }), 0, -0.85, 0);
    add(sw, tor(0.85, 0.07, 18), M(GOLD, { r: 0.3 }), 0, -1.5, 0, [Math.PI / 2, 0, 0]);
    add(sw, ball(0.28, 8), M(BRONZE), 0, -0.2, 0);
    add(sw, ball(0.14, 8), M(IRON), 0, -1.45, 0);
    add(sw, cyl(0.025, 0.025, 2.2, 5), M(WOOD), 0.95, -1.9, 0);
    this.anims.push((t) => { sw.rotation.z = Math.sin(t * 0.9) * (0.1 + 0.2 * Math.max(0, Math.sin(t * 0.17))); });
    // a row of small bells, and ravens on perches
    add(s, box(5, 0.08, 0.08), M(DWOOD), 1.5, 1.9, -5.3);
    for (let i = 0; i < 5; i++) {
      add(s, cyl(0.05, 0.2, 0.34, 8), M(BRONZE, { r: 0.35 }), -0.5 + i * 1.0, 1.65, -5.3);
      add(s, ball(0.04, 5), M(IRON), -0.5 + i * 1.0, 1.45, -5.3);
    }
    for (const x of [4.9, 5.7]) {
      add(s, cyl(0.04, 0.05, 1.5, 5), M(DWOOD), x, 0.75, -4.6);
      add(s, box(0.5, 0.04, 0.04), M(DWOOD), x, 1.5, -4.6);
      add(s, ball(0.14, 7), M(0x0d0a10), x, 1.68, -4.6, null, [0.8, 0.9, 1.4]);
      add(s, ball(0.08, 6), M(0x0d0a10), x, 1.82, -4.5);
      add(s, new THREE.ConeGeometry(0.025, 0.1, 4), M(BRONZE), x, 1.82, -4.4, [Math.PI / 2, 0, 0]);
    }
    // a table of parchment with a quill
    add(s, box(1.8, 0.1, 0.9), M(WOOD), -5.2, 0.85, 3.0);
    for (const dx of [-0.75, 0.75]) for (const dz of [-0.35, 0.35]) add(s, box(0.08, 0.85, 0.08), M(DWOOD), -5.2 + dx, 0.42, 3.0 + dz);
    add(s, box(0.6, 0.02, 0.45), M(PARCH), -5.4, 0.92, 3.0, [0, 0.2, 0]);
    add(s, cyl(0.01, 0.01, 0.5, 4), M(PARCH), -4.7, 1.05, 3.0, [0, 0, 1.2]);
    this.candle(R, -4.6, 0.9, 2.8, 0.22);
    // two tall windows
    for (const x of [-2.9, 2.9]) {
      add(s, box(0.8, 1.4, 0.05), M(0x5a6aa0, { e: 0.7 }), x, 1.2, -5.62);
      add(s, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12, 1, false, 0, Math.PI), M(0x5a6aa0, { e: 0.7 }), x, 1.9, -5.62, [Math.PI / 2, 0, 0]);
    }
    this.brazier(R, 7.2, 3.6, 0.9);
  }

  // ---------- ⚗️ Medbay → The Apothecary ----------
  room_medbay(R) {
    const s = R.s;
    for (const x of [-4.0, 4.0]) {
      add(s, box(3.6, 2.3, 0.6), M(DWOOD), x, 1.15, -7.3);
      for (let r = 0; r < 3; r++) {
        add(s, box(3.5, 0.06, 0.62), M(WOOD), x, 0.4 + r * 0.7, -7.28);
        for (let k = 0; k < 7; k++) {
          const c = [0x7dff6a, 0xff6ad0, 0x6ac8ff, 0xffd23f, 0xd18bff, 0xff6a6a][(k + r * 2) % 6];
          add(s, cyl(0.1, 0.12, 0.28 + (k % 3) * 0.06, 8), liquid(c), x - 1.4 + k * 0.46, 0.58 + r * 0.7, -7.0);
          add(s, cyl(0.04, 0.04, 0.1, 5), M(DWOOD), x - 1.4 + k * 0.46, 0.82 + r * 0.7 + (k % 3) * 0.03, -7.0);
        }
      }
    }
    add(s, ball(0.18, 8), M(PARCH), 4.0, 2.5, -7.3); // a skull on top of the shelf
    add(s, box(0.2, 0.1, 0.16), M(PARCH), 4.0, 2.35, -7.2);
    // a long bench of flasks
    add(s, box(3.4, 0.1, 1.1), M(WOOD), 3.0, 0.95, 2.8);
    for (const dx of [-1.4, 1.4]) for (const dz of [-0.4, 0.4]) add(s, box(0.1, 0.95, 0.1), M(DWOOD), 3.0 + dx, 0.47, 2.8 + dz);
    [[1.8, 0x7dff6a], [2.6, 0xff6ad0], [3.4, 0x6ac8ff], [4.2, 0xffd23f]].forEach(([x, c], i) => {
      add(s, ball(0.22, 10), glass(0xcfe9ff, 0.35), x, 1.27, 2.8);
      add(s, ball(0.17, 10), liquid(c), x, 1.23, 2.8);
      add(s, cyl(0.05, 0.05, 0.3, 6), glass(0xcfe9ff, 0.35), x, 1.58, 2.8);
      if (i < 3) add(s, cyl(0.015, 0.015, 0.8, 4), glass(0xcfe9ff, 0.5), x + 0.4, 1.7, 2.8, [0, 0, 1.2 - i * 0.2]);
    });
    add(s, cyl(0.2, 0.14, 0.12, 8), M(DSTONE), 2.3, 1.06, 2.2); // mortar
    add(s, cyl(0.03, 0.04, 0.4, 5), M(WOOD), 2.35, 1.3, 2.2, [0, 0, 0.5]);
    // the cauldron
    const pot = R.at(-5.4, 0, -3.4);
    add(pot, new THREE.SphereGeometry(0.75, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M(IRON, { r: 0.5 }), 0, 0.82, 0, [Math.PI, 0, 0]);
    add(pot, tor(0.62, 0.07, 16), M(IRON), 0, 0.98, 0, [Math.PI / 2, 0, 0]);
    add(pot, cyl(0.6, 0.6, 0.04, 16), liquid(0x7dff6a), 0, 0.96, 0);
    for (let i = 0; i < 3; i++) add(pot, cyl(0.04, 0.05, 0.4, 5), M(DWOOD), Math.cos(i * 2.1) * 0.4, 0.2, Math.sin(i * 2.1) * 0.4);
    this.flame(R, -5.4, 0.35, -3.4, 1.1, true);
    const bub = R.at(-5.4, 0.96, -3.4, 0, true);
    const bubbles = Array.from({ length: 5 }, (_, i) => ({ b: add(bub, ball(0.1, 6), liquid(0xb8ff9a), 0, 0, 0), a: i * 1.3, ph: i * 0.7 }));
    this.anims.push((t) => bubbles.forEach(({ b, a, ph }) => {
      const u = ((t * 0.6 + ph) % 2) / 2;
      b.position.set(Math.cos(a) * 0.4, Math.sin(u * Math.PI) * 0.4, Math.sin(a) * 0.4);
      b.scale.setScalar(0.3 + Math.sin(u * Math.PI) * 0.9);
    }));
    // dried herbs hanging on a rack
    for (const sx of [-1, 1]) add(s, cyl(0.04, 0.04, 2.2, 5), M(DWOOD), 5.8, 1.1, -3.8 + sx * 1.6);
    add(s, box(0.08, 0.08, 3.4), M(DWOOD), 5.8, 2.2, -3.8);
    for (let i = 0; i < 6; i++) add(s, new THREE.ConeGeometry(0.1, 0.45, 6), M([0x5a7a3a, 0x7a5a3a, 0x8a3a5a][i % 3]), 5.8, 1.95, -5.2 + i * 0.55, [Math.PI, 0, 0]);
  }

  // ---------- 🍖 Galley → The Banquet Hall ----------
  room_galley(R) {
    const s = R.s;
    const TZ = -3.6;
    add(s, box(12.4, 0.1, 1.9), M(CRIMSON, { r: 0.9 }), 0, 0.92, TZ);
    add(s, box(12.4, 0.02, 0.5), M(GOLD, { r: 0.5 }), 0, 0.975, TZ);
    for (const dx of [-5.8, -2, 2, 5.8]) for (const dz of [-0.8, 0.8]) add(s, box(0.15, 0.9, 0.15), M(DWOOD), dx, 0.45, TZ + dz);
    // ten chairs
    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const x = -4.8 + i * 2.4;
        const z = TZ + side * 1.55;
        add(s, box(0.55, 0.08, 0.55), M(WOOD), x, 0.5, z);
        add(s, box(0.55, 1.1, 0.07), M(DWOOD), x, 1.05, z + side * 0.27);
        for (const dx of [-0.22, 0.22]) for (const dz of [-0.22, 0.22]) add(s, box(0.06, 0.5, 0.06), M(DWOOD), x + dx, 0.25, z + dz);
        // a plate and a goblet at each place
        add(s, cyl(0.2, 0.2, 0.02, 10), M(PARCH), x, 1.0, TZ + side * 0.55);
        add(s, cyl(0.06, 0.04, 0.2, 7), M(GOLD, { e: 0.2, r: 0.3 }), x + 0.28, 1.1, TZ + side * 0.45);
      }
    }
    // candelabras, a roast boar and bread
    for (const x of [-4.2, 0, 4.2]) {
      add(s, cyl(0.04, 0.08, 0.6, 6), M(GOLD, { r: 0.35 }), x, 1.25, TZ);
      add(s, box(0.6, 0.04, 0.04), M(GOLD, { r: 0.35 }), x, 1.5, TZ);
      for (const dx of [-0.3, 0, 0.3]) this.candle(R, x + dx, 1.5, TZ, 0.2);
    }
    add(s, ball(0.5, 10), M(0x8a4a22, { r: 0.6 }), -1.9, 1.3, TZ, null, [1.5, 0.8, 0.85]);
    add(s, ball(0.22, 8), M(0x8a4a22), -1.2, 1.35, TZ);
    add(s, ball(0.08, 6), M(0xd7263d), -1.0, 1.4, TZ);
    for (let i = 0; i < 3; i++) add(s, ball(0.16, 6), M(0xc99a4a), 2.2 + i * 0.4, 1.1, TZ - 0.3 + (i % 2) * 0.4, null, [1.3, 0.8, 0.9]);
    for (let i = 0; i < 4; i++) add(s, ball(0.12, 7), M([0xd7263d, 0x7fe33b, 0xffd23f, 0xd7263d][i]), 3.5 + i * 0.2, 1.08 + (i > 1 ? 0.15 : 0), TZ + 0.4 - (i % 2) * 0.2);
    // shields on the wall, armour in the corners
    for (const x of [-3.0, 3.0]) {
      add(s, cyl(0.5, 0.5, 0.06, 6), M(0x2c4a7a), x, 1.55, -7.55, [Math.PI / 2, 0, 0]);
      add(s, box(0.12, 0.7, 0.04), M(GOLD, { r: 0.4 }), x, 1.55, -7.5);
    }
    this.armour(R, -7.0, 5.2);
    this.armour(R, 7.0, 5.2);
    this.brazier(R, 0, 5.6, 0.9);
  }

  // ---------- 🔥 Reactor → The Great Hearth ----------
  room_reactor(R) {
    const s = R.s;
    for (const sx of [-1, 1]) add(s, box(0.9, 2.3, 0.9), M(STONE), sx * 2.8, 1.15, -5.1);
    add(s, box(6.9, 0.6, 1.1), M(STONE), 0, 2.15, -5.1);
    add(s, box(4.7, 2.0, 0.3), M(0x15101a), 0, 1.0, -5.5);
    for (let i = 0; i < 3; i++) add(s, cyl(0.15, 0.15, 3, 7), M(DWOOD), (i - 1) * 0.1, 0.2 + (i > 1 ? 0.3 : 0), -5.0 + (i % 2) * 0.1, [0, i * 0.1, Math.PI / 2]);
    for (let i = 0; i < 6; i++) this.flame(R, -1.4 + i * 0.56, 0.5, -5.0, 2.6 - Math.abs(i - 2.5) * 0.35, i % 2 === 0);
    add(s, cyl(0.04, 0.04, 2.4, 5), M(IRON), 1.6, 1.3, -4.7);
    add(s, box(1.5, 0.06, 0.06), M(IRON), 1.0, 2.0, -4.7);
    add(s, ball(0.4, 10), M(IRON, { r: 0.5 }), 0.4, 1.3, -4.7);
    // a rug and two armchairs facing the fire
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.02, 28), RUG);
    rug.position.set(0, 0.016, 0.5);
    s.add(rug);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.06, 4, 36), RUG_TRIM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, 0.5);
    s.add(ring);
    for (const sx of [-1, 1]) {
      const c = R.at(sx * 4.4, 0, -0.8, 0);
      add(c, box(1.0, 0.4, 0.9), M(CRIMSON, { r: 0.9 }), 0, 0.35, 0);
      add(c, box(1.0, 0.95, 0.2), M(CRIMSON, { r: 0.9 }), 0, 0.9, 0.4);
      for (const a of [-1, 1]) add(c, box(0.14, 0.5, 0.8), M(0x7a1220), a * 0.5, 0.55, 0);
    }
    // a sleeping hound
    const hound = R.at(1.8, 0, -3.2, 0.3, true);
    const brown = M(0x7a5a3a, { r: 0.9 });
    const body = add(hound, new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), brown, 0, 0.26, 0, [0, 0, Math.PI / 2]);
    add(hound, ball(0.2, 8), brown, 0.52, 0.28, 0);
    add(hound, ball(0.11, 6), M(0x5a3a22), 0.7, 0.24, 0, null, [1.3, 0.8, 0.9]);
    for (const z of [-0.15, 0.15]) add(hound, box(0.12, 0.2, 0.06), M(0x5a3a22), 0.48, 0.38, z, [0.6 * Math.sign(z), 0, 0]);
    add(hound, new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), brown, -0.55, 0.14, 0.15, [0, 0, 1.2]);
    this.anims.push((t) => { body.scale.set(1, 1 + Math.sin(t * 1.5) * 0.05, 1 + Math.sin(t * 1.5) * 0.06); });
    // a stack of logs
    for (let i = 0; i < 6; i++) add(s, cyl(0.17, 0.17, 1.4, 7), M(0x5a3a22), -6.4, 0.18 + Math.floor(i / 3) * 0.3, -3.6 + (i % 3) * 0.34 + (i > 2 ? 0.17 : 0), [0, 0, Math.PI / 2]);
    this.brazier(R, 7, 4.8, 0.9);
  }

  // ---------- ⛓️ Engine Room → The Dungeon ----------
  room_engine(R) {
    const s = R.s;
    const bars = (cx) => {
      for (let i = 0; i < 9; i++) add(s, cyl(0.04, 0.04, 2.3, 5), M(IRON, { r: 0.5 }), cx - 1.6 + i * 0.4, 1.15, -5.2);
      for (const y of [0.15, 1.2, 2.25]) add(s, box(3.8, 0.08, 0.08), M(IRON, { r: 0.5 }), cx, y, -5.2);
    };
    bars(-5.6);
    bars(5.6);
    add(s, box(3.6, 0.08, 1.3), M(0xc2a45a, { r: 0.95 }), -5.6, 0.04, -6.2); // straw
    add(s, box(3.6, 0.08, 1.3), M(0xc2a45a, { r: 0.95 }), 5.6, 0.04, -6.2);
    // a skeleton in the east cell
    add(s, ball(0.16, 8), M(PARCH), 5.2, 0.28, -6.1);
    add(s, new THREE.CapsuleGeometry(0.14, 0.4, 3, 6), M(PARCH), 5.7, 0.2, -6.1, [0, 0, Math.PI / 2]);
    for (const z of [-6.3, -5.9]) add(s, cyl(0.03, 0.03, 0.55, 4), M(PARCH), 6.3, 0.1, z, [0, 0, Math.PI / 2]);
    // chains on the wall
    for (const [x, y] of [[-7.0, 1.9], [-3.0, 2.0], [3.0, 1.9]]) {
      for (let i = 0; i < 5; i++) add(s, tor(0.07, 0.016, 8), M(IRON, { r: 0.5 }), x, y - i * 0.16, -6.85, [i % 2 ? 0 : Math.PI / 2, 0, 0]);
      add(s, tor(0.14, 0.03, 10), M(IRON), x, y - 0.85, -6.8);
    }
    // the stocks
    add(s, box(1.8, 0.12, 0.3), M(WOOD), -6.2, 1.1, 2.2);
    add(s, box(1.8, 0.12, 0.3), M(WOOD), -6.2, 0.9, 2.2);
    for (const sx of [-1, 1]) add(s, box(0.12, 1.3, 0.2), M(DWOOD), -6.2 + sx * 0.85, 0.65, 2.2);
    // the gibbet
    add(s, box(0.22, 3.6, 0.22), M(DWOOD), 7.6, 1.8, 3.2);
    add(s, box(1.6, 0.18, 0.18), M(DWOOD), 6.9, 3.5, 3.2);
    const cage = R.at(6.4, 3.4, 3.2, 0, true);
    const sway = new THREE.Group();
    cage.add(sway);
    add(sway, cyl(0.015, 0.015, 0.8, 4), M(IRON), 0, -0.4, 0);
    for (let i = 0; i < 7; i++) add(sway, cyl(0.025, 0.025, 1.1, 4), M(IRON, { r: 0.5 }), Math.cos(i * 0.9) * 0.3, -1.4, Math.sin(i * 0.9) * 0.3);
    for (const y of [-0.9, -1.4, -1.95]) add(sway, tor(0.3, 0.02, 10), M(IRON), 0, y, 0, [Math.PI / 2, 0, 0]);
    add(sway, ball(0.14, 7), M(PARCH), 0, -1.6, 0);
    this.anims.push((t) => { sway.rotation.z = Math.sin(t * 0.8) * 0.12; sway.rotation.x = Math.sin(t * 0.6 + 1) * 0.08; });
    // bones, puddles and a drip
    for (let i = 0; i < 5; i++) add(s, cyl(0.025, 0.025, 0.4, 4), M(PARCH), -1.2 + i * 0.3, 0.03, 5.3 + (i % 2) * 0.3, [0, i, Math.PI / 2]);
    add(s, ball(0.13, 7), M(PARCH), -0.4, 0.13, 5.5);
    add(s, new THREE.CircleGeometry(1.1, 14), M(0x2a3a5a, { o: 0.55, r: 0.05 }), 0.5, 0.025, 1.5, [-Math.PI / 2, 0, 0]);
    const drop = R.at(0.5, 3, 1.5, 0, true);
    const dm = add(drop, ball(0.05, 6), glass(0x9fc8ff, 0.8), 0, 0, 0, null, [0.7, 1.4, 0.7]);
    this.anims.push((t) => { const u = (t * 0.45) % 1; dm.position.y = -u * u * 2.95; dm.visible = u < 0.97; });
    // two rats
    this.rats = [];
    for (let i = 0; i < 2; i++) {
      const g = R.at(0, 0, 0, 0, true);
      add(g, ball(0.11, 6), M(0x4a4048), 0, 0.1, 0, null, [1.6, 0.8, 0.9]);
      add(g, ball(0.06, 5), M(0x4a4048), 0.2, 0.1, 0);
      add(g, cyl(0.008, 0.008, 0.3, 3), M(0xc99a8a), -0.3, 0.06, 0, [0, 0, Math.PI / 2]);
      this.rats.push({ g, ph: i * 3.3, z: 3.8 + i * 1.4, cx: R.cx, cz: R.cz });
    }
    this.brazier(R, 2.4, -5.6, 0.8);
  }

  // ---------- 🌹 Hydroponics → The Walled Garden ----------
  room_hydroponics(R) {
    const s = R.s;
    const hedge = T('dots', 0x1f4a2a, 0x2d6a36, 4, 1);
    for (const [x, w] of [[-4.6, 4.0], [4.6, 4.0]]) add(s, box(w, 1.5, 1.0), hedge, x, 0.75, -5.2);
    for (const [x, w] of [[-5, 4.2], [5, 4.2]]) add(s, box(w, 0.8, 0.8), hedge, x, 0.4, 5.3);
    // the fountain
    add(s, cyl(1.7, 1.8, 0.5, 20), M(STONE), -4, 0.25, -0.5);
    add(s, cyl(1.5, 1.5, 0.05, 20), M(0x3a6a9a, { e: 0.3, o: 0.8, r: 0.05 }), -4, 0.5, -0.5);
    add(s, cyl(0.25, 0.35, 1.2, 10), M(STONE), -4, 1.1, -0.5);
    add(s, cyl(0.8, 0.45, 0.25, 14), M(STONE), -4, 1.65, -0.5);
    add(s, cyl(0.7, 0.7, 0.04, 14), M(0x3a6a9a, { e: 0.3, o: 0.8, r: 0.05 }), -4, 1.76, -0.5);
    add(s, ball(0.18, 8), M(STONE), -4, 2.05, -0.5);
    const jets = R.at(-4, 2.0, -0.5, 0, true);
    const drops = Array.from({ length: 8 }, (_, i) => ({ d: add(jets, ball(0.06, 5), glass(0x9fd8ff, 0.8), 0, 0, 0), a: (i / 8) * 6.28, ph: i / 8 }));
    this.anims.push((t) => drops.forEach(({ d, a, ph }) => {
      const u = (t * 0.6 + ph) % 1;
      d.position.set(Math.cos(a) * u * 0.9, Math.sin(u * Math.PI) * 0.7 - 0.1, Math.sin(a) * u * 0.9);
    }));
    // rose bushes, topiary, lanterns
    for (const [x, z] of [[5.6, -3], [-6.6, 3.4], [6.6, 3.2], [-1.2, 3.8]]) {
      add(s, ball(0.6, 8), M(0x2d6a36), x, 0.5, z, null, [1.2, 0.8, 1]);
      for (let i = 0; i < 7; i++) add(s, ball(0.1, 6), M(i % 3 ? 0xd7263d : 0xf4f1e8, { e: 0.15 }), x + Math.cos(i * 1.3) * 0.55, 0.65 + (i % 3) * 0.12, z + Math.sin(i * 1.3) * 0.4);
    }
    for (const [x, z] of [[-1.5, -3.8], [1.8, -3.9]]) {
      add(s, cyl(0.28, 0.35, 0.3, 8), M(DSTONE), x, 0.15, z);
      add(s, ball(0.42, 9), hedge, x, 0.75, z);
      add(s, ball(0.28, 9), hedge, x, 1.35, z);
    }
    for (const [x, z] of [[-7.2, -1.8], [7.2, -1.2], [1.0, 4.4]]) {
      add(s, cyl(0.04, 0.05, 1.6, 5), M(IRON), x, 0.8, z);
      add(s, ball(0.16, 8), M(0xcfe0ff, { e: 1.3, o: 0.9 }), x, 1.75, z);
    }
    // a weeping statue on a plinth
    add(s, box(0.9, 0.7, 0.9), M(DSTONE), 5.0, 0.35, -3.5);
    add(s, new THREE.CapsuleGeometry(0.18, 0.7, 4, 8), M(0xaaa8b4), 5.0, 1.2, -3.5);
    add(s, ball(0.16, 8), M(0xaaa8b4), 5.0, 1.78, -3.5);
    for (const sx of [-1, 1]) add(s, box(0.06, 0.8, 0.5), M(0xaaa8b4), 5.0 + sx * 0.3, 1.5, -3.6, [0.2, 0, sx * 0.4]);
    // a stone bench
    add(s, box(1.8, 0.12, 0.5), M(STONE), 0.6, 0.45, 4.6);
    for (const sx of [-1, 1]) add(s, box(0.12, 0.45, 0.45), M(STONE), 0.6 + sx * 0.75, 0.22, 4.6);
    // a rose arch over the west gate
    add(s, new THREE.TorusGeometry(1.9, 0.1, 6, 18, Math.PI), M(0x2d6a36), -7.7, 0, 1.0, [0, Math.PI / 2, 0]).scale.set(1, 1.1, 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      add(s, ball(0.1, 6), M(i % 2 ? 0xd7263d : 0xf4f1e8, { e: 0.2 }), -7.7, Math.sin(a) * 2.1, 1.0 + Math.cos(a) * 1.9);
    }
    // fireflies
    const n = this.lowFx ? 14 : 30;
    this.firePos = new Float32Array(n * 3);
    this.fireData = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 14, y: 0.5 + Math.random() * 1.8, z: (Math.random() - 0.5) * 9, ph: Math.random() * 10, sp: 0.3 + Math.random() * 0.5 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.firePos, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, color: 0xe8ff7a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireflies.frustumCulled = false;
    this.fireRoom = R;
    this.group.add(this.fireflies);
  }

  // ---------- 🚪 Airlock → The Banishment Gate ----------
  room_airlock(R) {
    const s = R.s;
    const gx = -3.55;
    add(s, box(0.4, 3.2, 0.8), M(STONE), gx - 0.1, 1.6, -3.0);
    add(s, box(0.4, 3.2, 0.8), M(STONE), gx - 0.1, 1.6, 3.0);
    add(s, box(0.5, 0.6, 7.0), M(STONE), gx - 0.1, 3.2, 0);
    add(s, box(0.12, 2.6, 5.4), M(0x15080a, { r: 0.9 }), gx - 0.35, 1.3, 0); // the dark beyond
    add(s, box(0.14, 2.6, 5.4), M(0xff2a30, { e: 0.35, o: 0.35 }), gx - 0.3, 1.3, 0);
    const port = R.at(gx + 0.12, 0, 0, 0, true);
    for (let i = 0; i < 12; i++) add(port, cyl(0.045, 0.045, 3.0, 5), M(IRON, { r: 0.45 }), 0, 1.5, -2.5 + i * 0.45);
    for (let i = 0; i < 6; i++) add(port, box(0.08, 0.08, 5.4), M(IRON, { r: 0.45 }), 0, 0.3 + i * 0.5, 0);
    for (let i = 0; i < 12; i++) add(port, new THREE.ConeGeometry(0.06, 0.28, 5), M(IRON), 0, -0.1, -2.5 + i * 0.45, [Math.PI, 0, 0]);
    this.anims.push((t) => { port.position.y = 0.3 + Math.sin(t * 0.35) * 0.25; });
    // the red carpet, and pikes with skulls
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.02, 2.0), RUG);
    carpet.position.set(0.1, 0.018, 0);
    s.add(carpet);
    for (const sz of [-1, 1]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.02, 0.1), RUG_TRIM);
      trim.position.set(0.1, 0.022, sz * 0.9);
      s.add(trim);
      add(s, cyl(0.03, 0.03, 2.4, 5), M(DWOOD), -2.6, 1.2, sz * 2.4);
      add(s, ball(0.16, 8), M(PARCH), -2.6, 2.5, sz * 2.4);
      this.brazier(R, 0.4, sz * 3.9, 0.85);
    }
    this.armour(R, 3.0, -3.4, -Math.PI / 2);
    this.armour(R, 3.0, 3.4, -Math.PI / 2);
  }

  // ---------- 🛏️ Crew Quarters → The Bedchambers ----------
  room_quarters(R) {
    const s = R.s;
    const rug = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.02, 2.6), RUG_PURPLE);
    rug.position.set(0, 0.016, 0.2);
    s.add(rug);
    [-2.4, 2.4].forEach((x, i) => {
      add(s, box(2.0, 0.4, 3.0), M(DWOOD), x, 0.3, -4.2);
      add(s, box(1.9, 0.25, 2.9), M(PARCH, { r: 0.95 }), x, 0.6, -4.2);
      add(s, box(1.9, 0.12, 1.9), M(i ? 0x3a1a5a : CRIMSON, { r: 0.95 }), x, 0.75, -3.8);
      add(s, box(0.8, 0.14, 0.4), M(0xf4f1e8), x, 0.78, -5.4);
      for (const dx of [-1, 1]) for (const dz of [-1.5, 1.5]) add(s, cyl(0.06, 0.06, 2.3, 6), M(DWOOD), x + dx, 1.15, -4.2 + dz);
      add(s, box(2.2, 0.08, 3.2), M(i ? 0x3a1a5a : CRIMSON, { r: 0.95 }), x, 2.3, -4.2);
      add(s, box(0.04, 1.4, 3.0), M(i ? 0x3a1a5a : CRIMSON, { o: 0.75, r: 0.95 }), x - 1.0, 1.5, -4.2);
      add(s, box(0.04, 1.4, 3.0), M(i ? 0x3a1a5a : CRIMSON, { o: 0.75, r: 0.95 }), x + 1.0, 1.5, -4.2);
      add(s, box(1.9, 0.4, 0.5), M(WOOD), x, 0.2, -2.3); // a chest at the foot
      add(s, box(1.92, 0.06, 0.52), M(GOLD, { r: 0.4 }), x, 0.42, -2.3);
    });
    add(s, box(0.6, 0.7, 0.6), M(WOOD), 0, 0.35, -5.4);
    this.candle(R, 0, 0.7, -5.4, 0.22);
    // a tall mirror and a wardrobe
    add(s, box(0.9, 1.9, 0.08), M(GOLD, { r: 0.4 }), -5.3, 1.0, 3.0, [-0.12, 0.5, 0]);
    add(s, box(0.74, 1.74, 0.09), glass(0xcfe0ff, 0.55), -5.28, 1.0, 3.02, [-0.12, 0.5, 0]);
    add(s, box(1.3, 2.2, 0.7), M(DWOOD), 4.6, 1.1, -3.2);
    for (const sx of [-1, 1]) add(s, ball(0.05, 5), M(GOLD), sx * 0.12 + 4.6, 1.1, -2.82);
    this.armour(R, 5.0, 3.0, -Math.PI / 2);
  }

  // ---------- 🍷 Cargo → The Wine Cellar ----------
  room_cargo(R) {
    const s = R.s;
    const hoop = M(IRON, { r: 0.5 });
    const barrel = (x, y, z) => {
      add(s, BARREL, M(WOOD, { r: 0.85 }), x, y, z);
      for (const dy of [-0.27, 0.27]) add(s, tor(0.52, 0.025, 14), hoop, x, y + dy, z, [Math.PI / 2, 0, 0]);
    };
    [-7.5, -6.1, -4.7, -3.3, 3.3, 4.7, 6.1, 7.5].forEach((x, i) => {
      barrel(x, 0.5, -3.8);
      if (i % 2 === 0 && x !== 3.3) barrel(x + 0.7, 1.5, -3.8);
    });
    // wine racks down both side walls
    for (const sx of [-1, 1]) {
      add(s, box(0.7, 2.2, 4.4), M(DWOOD), sx * 9.2, 1.1, 0.4);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
        add(s, cyl(0.1, 0.1, 0.12, 7), M(c % 3 === 0 ? 0x1c3a22 : 0x2c1a1a, { r: 0.3 }), sx * 8.82, 0.4 + r * 0.5, -1.45 + c * 0.55, [0, 0, Math.PI / 2]);
        add(s, ball(0.05, 4), M(0xd9a441), sx * 8.78, 0.4 + r * 0.5, -1.45 + c * 0.55);
      }
    }
    // a tasting table with goblets and a cheese
    add(s, cyl(0.9, 0.9, 0.08, 14), M(WOOD), -5, 0.95, 1.8);
    add(s, cyl(0.1, 0.14, 0.95, 6), M(DWOOD), -5, 0.47, 1.8);
    for (let i = 0; i < 3; i++) add(s, cyl(0.06, 0.04, 0.2, 7), M(GOLD, { e: 0.2, r: 0.3 }), -5.4 + i * 0.4, 1.1, 1.6 + (i % 2) * 0.3);
    add(s, cyl(0.28, 0.28, 0.2, 12), M(0xe8c25a), -4.7, 1.1, 2.1);
    this.candle(R, -5, 1.0, 1.8, 0.22);
    // crates and a spilled puddle
    for (const [x, z, h] of [[1.6, 3.4, 0.8], [2.8, 3.7, 0.6], [2.0, 2.6, 0.5]]) add(s, box(0.95, h, 0.95), M(WOOD), x, h / 2, z);
    add(s, new THREE.CircleGeometry(0.9, 14), M(0x7a0f1e, { o: 0.75, r: 0.05, e: 0.1 }), -1.4, 0.025, 2.6, [-Math.PI / 2, 0, 0]);
    // a lantern swinging on a hook
    add(s, cyl(0.05, 0.05, 2.4, 5), M(DWOOD), 0.2, 1.2, 0.35);
    add(s, box(0.06, 0.06, 0.9), M(IRON), 0.2, 2.35, 0.8);
    const lamp = R.at(0.2, 2.3, 1.2, 0, true);
    add(lamp, cyl(0.01, 0.01, 0.4, 3), M(IRON), 0, -0.2, 0);
    add(lamp, box(0.28, 0.34, 0.28), glass(0xffd27a, 0.6), 0, -0.55, 0);
    add(lamp, ball(0.1, 6), M(0xffd27a, { e: 2 }), 0, -0.55, 0);
    this.anims.push((t) => { lamp.rotation.z = Math.sin(t * 0.9) * 0.12; });
    this.brazier(R, 8.6, 3.6, 0.8);
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    for (const f of this.flames) {
      const k = 0.8 + Math.sin(t * 11 + f.ph) * 0.2 + Math.sin(t * 17.3 + f.ph * 2) * 0.12;
      f.m.scale.set(1 + (1 - k) * 0.3, k * 1.25, 1 + (1 - k) * 0.3);
      f.m.position.y = f.y + (k - 0.8) * 0.06;
      if (f.halo) f.halo.material.opacity = 0.4 + k * 0.28;
    }
    this.emberData.forEach((e, i) => {
      e.y += e.speed * dt;
      if (e.y > 3.6) e.y = 0;
      this.emberPos.set([e.x + Math.sin(t * 0.7 + e.sway) * 0.35, e.y, e.z + Math.cos(t * 0.5 + e.sway) * 0.35], i * 3);
    });
    this.emberPoints.geometry.attributes.position.needsUpdate = true;
    for (const { m, ph } of this.mists) {
      m.rotation.z = t * 0.03 + ph;
      m.material.opacity = (this.lowFx ? 0.1 : 0.16) + Math.sin(t * 0.3 + ph) * 0.05;
    }
    for (const b of this.birds) {
      b.a += b.s * dt / (b.r / 11);
      b.g.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.8 + b.ph) * 0.4, Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a;
      b.g.rotation.z = Math.sin(t * 7 + b.ph) * 0.45; // flapping
    }
    for (const f of this.float || []) {
      f.g.position.y = f.y + Math.sin(t * 0.9 + f.ph) * 0.18;
      f.g.rotation.y += dt * 0.4;
      if (f.flame) f.flame.y = f.g.position.y + 0.27 + 0.14;
      if (f.wings) {
        f.wings[0].rotation.z = 0.1 + Math.abs(Math.sin(t * 1.8 + f.ph)) * 0.8;
        f.wings[1].rotation.z = -f.wings[0].rotation.z;
        f.g.rotation.x = 0.2;
      }
    }
    for (const r of this.rats || []) {
      const u = ((t * 0.12 + r.ph) % 2);
      const x = (u < 1 ? u : 2 - u) * 12 - 6;
      r.g.position.set(r.cx + x, 0, r.cz + r.z);
      r.g.rotation.y = u < 1 ? 0 : Math.PI;
      r.g.position.y = Math.abs(Math.sin(t * 14 + r.ph)) * 0.03;
    }
    if (this.fireflies) {
      this.fireData.forEach((f, i) => {
        this.firePos.set([this.fireRoom.cx + f.x + Math.sin(t * f.sp + f.ph) * 0.8, f.y + Math.sin(t * f.sp * 1.3 + f.ph) * 0.35, this.fireRoom.cz + f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.8], i * 3);
      });
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.material.opacity = 0.65 + Math.sin(t * 2.3) * 0.25;
    }
  }
}
