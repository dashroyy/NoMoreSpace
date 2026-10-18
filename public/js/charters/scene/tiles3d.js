// Star Charters: a 3D tile, built from the very same 7 x 7 letter map the rules use (so what you see is exactly what
// joins up). A thick cream tile with deep space on top; station squares become a raised deck of toy modules
// (towers, glass domes, lit windows) with a teal hull wall where the station meets the void; warp lanes are glowing
// gold tubes with stripes running along them; arrays are satellite dishes; a black hole has a hot spinning disc.
//
// Each kind of tile is built once (its unturned shape) and every copy shares those shapes; a placed tile is simply
// turned. makeTile() gives a group whose userData.update(dt, t) runs its little animations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILE, CELL, TOP, mats, seeded } from './look.js';

const N = 7;
const DECK = 0.09; // how high a station's deck stands off the tile
export const DECK_H = DECK;

// where a square's middle is on the tile (the tile's middle is 0, 0)
export const cellPos = (cx, cy) => [(cx + 0.5 - N / 2) * CELL, (cy + 0.5 - N / 2) * CELL];
// the middle of each side's edge
const EDGE = [
  [0, -TILE / 2],
  [TILE / 2, 0],
  [0, TILE / 2],
  [-TILE / 2, 0],
];
const CORNER = { '0,1': [TILE / 2, -TILE / 2], '1,2': [TILE / 2, TILE / 2], '2,3': [-TILE / 2, TILE / 2], '0,3': [-TILE / 2, -TILE / 2] };

const isStation = (ch) => ch === 'S' || ch === 'C' || ch === 'Q';

// a quarter circle round a tile corner (a lane that bends)
class Arc extends THREE.Curve {
  constructor(cx, cz, r, a0, a1, y) {
    super();
    Object.assign(this, { cx, cz, r, a0, a1, y });
  }
  getPoint(t, out = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    return out.set(this.cx + Math.cos(a) * this.r, this.y, this.cz + Math.sin(a) * this.r);
  }
}

// the path a lane piece takes across the tile
export function laneCurve(seg, y = TOP + 0.075) {
  const sides = [...seg.sides].sort((a, b) => a - b);
  if (sides.length === 2) {
    const [a, b] = sides;
    const A = EDGE[a];
    const B = EDGE[b];
    if (b - a === 2) return new THREE.LineCurve3(new THREE.Vector3(A[0], y, A[1]), new THREE.Vector3(B[0], y, B[1]));
    const c = CORNER[`${a},${b}`];
    const a0 = Math.atan2(A[1] - c[1], A[0] - c[0]);
    let a1 = Math.atan2(B[1] - c[1], B[0] - c[0]);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
    return new Arc(c[0], c[1], TILE / 2, a0, a1, y);
  }
  // a lane that stops on the tile: from its edge to the square it stops on (and a little way into what is there)
  const A = EDGE[sides[0]];
  const [ex, ez] = cellPos(...seg.end);
  const dir = new THREE.Vector2(ex - A[0], ez - A[1]).normalize();
  const reach = 0.42 * CELL;
  return new THREE.LineCurve3(new THREE.Vector3(A[0], y, A[1]), new THREE.Vector3(ex + dir.x * reach, y, ez + dir.y * reach));
}

// a flat ribbon along a curve (the glow under a lane)
function ribbon(curve, width, y) {
  const n = 24;
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const tng = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPoint(t, p);
    curve.getTangent(t, tng);
    const nx = -tng.z;
    const nz = tng.x;
    const len = Math.hypot(nx, nz) || 1;
    pos.push(p.x + (nx / len) * width, y, p.z + (nz / len) * width, p.x - (nx / len) * width, y, p.z - (nz / len) * width);
    uv.push(t, 0, t, 1);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const at = (geo, x, y, z, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
};

// ---------------------------------------------------------------------------
// one kind of tile, built once
// ---------------------------------------------------------------------------
const templates = new Map();

function buildTemplate(def) {
  const shape = def.shapes[0];
  const rows = shape.rows;
  const ch = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : rows[y][x]);
  const rnd = seeded([...def.id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0);
  const parts = {}; // material name -> [geometries]
  const add = (mat, geo) => (parts[mat] = parts[mat] || []).push(geo);
  const extras = []; // animated or special pieces: { kind, x, z, ... }

  // ----- stations: a deck, a hull wall round the edge, and modules on top
  for (let cy = 0; cy < N; cy++)
    for (let cx = 0; cx < N; cx++) {
      const c = ch(cx, cy);
      if (!isStation(c)) continue;
      const [x, z] = cellPos(cx, cy);
      add('hull', at(new THREE.BoxGeometry(CELL * 1.002, DECK, CELL * 1.002), x, TOP + DECK / 2, z));
      for (const [dx, dy, ry] of [[1, 0, 0], [-1, 0, 0], [0, 1, Math.PI / 2], [0, -1, Math.PI / 2]]) {
        const n = ch(cx + dx, cy + dy);
        if (n === null || isStation(n)) continue;
        add('teal', at(new THREE.BoxGeometry(0.045, 0.16, CELL + 0.045), x + (dx * CELL) / 2, TOP + 0.08, z + (dy * CELL) / 2, ry));
      }
      if (c === 'C') {
        extras.push({ kind: 'core', x, z });
        continue;
      }
      if (c === 'Q') {
        extras.push({ kind: 'qportal', x, z });
        continue;
      }
      const r = rnd();
      const y0 = TOP + DECK;
      if (r < 0.26) {
        const h = 0.16 + rnd() * 0.26;
        add('hull', at(new THREE.CylinderGeometry(0.07, 0.085, h, 14), x, y0 + h / 2, z));
        add('window', at(new THREE.CylinderGeometry(0.0735, 0.0735, 0.035, 14), x, y0 + h * 0.68, z));
        add('orange', at(new THREE.ConeGeometry(0.075, 0.09, 14), x, y0 + h + 0.045, z));
      } else if (r < 0.44) {
        add('glass', at(new THREE.SphereGeometry(0.105, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, y0, z));
        add('teal', at(new THREE.TorusGeometry(0.105, 0.014, 6, 18).rotateX(Math.PI / 2), x, y0 + 0.005, z));
      } else if (r < 0.6) {
        const w = 0.18 + rnd() * 0.05;
        add('hullDark', at(new THREE.BoxGeometry(w, 0.11, 0.16), x, y0 + 0.055, z, rnd() < 0.5 ? Math.PI / 2 : 0));
        add('window', at(new THREE.BoxGeometry(w + 0.006, 0.024, 0.166), x, y0 + 0.07, z, 0));
      } else if (r < 0.66) {
        add('hullDark', at(new THREE.CylinderGeometry(0.01, 0.014, 0.3, 6), x, y0 + 0.15, z));
        add('red', at(new THREE.SphereGeometry(0.025, 8, 6), x, y0 + 0.31, z));
      }
    }

  // ----- warp lanes: a striped glowing tube, with a glow on the ground, and a hub where lanes stop
  for (const seg of shape.segs) {
    if (seg.k !== 'L') continue;
    const curve = laneCurve(seg);
    const tube = new THREE.TubeGeometry(curve, curve instanceof THREE.LineCurve3 ? 2 : 20, 0.05, 10, false);
    const len = curve.getLength();
    const uvs = tube.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * (len / 0.4));
    add('lane', tube);
    add('laneGlow', ribbon(curve, 0.17, TOP + 0.004));
  }
  for (let cy = 0; cy < N; cy++)
    for (let cx = 0; cx < N; cx++) {
      const c = ch(cx, cy);
      const [x, z] = cellPos(cx, cy);
      if (c === 'X') {
        add('hub', at(new THREE.CylinderGeometry(0.15, 0.18, 0.14, 20), x, TOP + 0.07, z));
        add('hubLight', at(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), x, TOP + 0.15, z));
      }
      if (c === 'A') extras.push({ kind: 'array', x, z });
      if (c === 'H') extras.push({ kind: 'hole', x, z });
      if (c === 'O') extras.push({ kind: 'oportal', x, z });
    }

  // ----- a few small rocks drifting in the void
  const voids = [];
  for (let cy = 1; cy < N - 1; cy++) for (let cx = 1; cx < N - 1; cx++) if (ch(cx, cy) === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => ch(cx + dx, cy + dy) === '.')) voids.push([cx, cy]);
  if (!rows.join('').includes('H'))
    for (let i = 0; i < Math.min(2, voids.length); i++) {
      const [cx, cy] = voids[Math.floor(rnd() * voids.length)];
      const [x, z] = cellPos(cx, cy);
      const s = 0.045 + rnd() * 0.05;
      add('rock', at(new THREE.IcosahedronGeometry(s, 0).rotateX(rnd() * 3).rotateZ(rnd() * 3), x + (rnd() - 0.5) * 0.1, TOP + 0.12 + rnd() * 0.06, z + (rnd() - 0.5) * 0.1));
    }

  const merged = {};
  for (const [name, list] of Object.entries(parts)) merged[name] = mergeGeometries(list, false);
  return { merged, extras, hole: rows.join('').includes('H') };
}

// shared shapes for the tile's base
let SLAB = null;
let FACE = null;
function base() {
  if (!SLAB) {
    SLAB = new RoundedBoxGeometry(TILE * 0.97, TOP, TILE * 0.97, 2, 0.06);
    SLAB.translate(0, TOP / 2, 0);
    FACE = new THREE.PlaneGeometry(TILE * 0.93, TILE * 0.93).rotateX(-Math.PI / 2);
    FACE.translate(0, TOP + 0.002, 0);
  }
  return { SLAB, FACE };
}

// ---------------------------------------------------------------------------
// the animated pieces
// ---------------------------------------------------------------------------
function makeExtra(e, M) {
  const g = new THREE.Group();
  g.position.set(e.x, 0, e.z);
  if (e.kind === 'array') {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.06, 28), M.teal);
    pad.position.y = TOP + 0.03;
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 6, 32).rotateX(Math.PI / 2), M.window);
    ring.position.y = TOP + 0.065;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.34, 10), M.hull);
    mast.position.y = TOP + 0.23;
    mast.castShadow = true;
    const head = new THREE.Group();
    head.position.y = TOP + 0.4;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * 0.36;
      pts.push(new THREE.Vector2(r, r * r * 1.3));
    }
    const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M.white);
    dish.castShadow = true;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), M.hullDark);
    feed.position.y = 0.13;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.orange);
    tip.position.y = 0.27;
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.6;
    tilt.add(dish, feed, tip);
    head.add(tilt);
    g.add(pad, ring, mast, head);
    g.userData.update = (dt, t) => {
      head.rotation.y = t * 0.35 + e.x;
    };
    g.userData.dish = head;
  } else if (e.kind === 'hole') {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), M.hole);
    core.position.y = TOP + 0.34;
    const photon = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 40), M.photon);
    photon.position.y = TOP + 0.34;
    const tilt = new THREE.Group();
    tilt.position.y = TOP + 0.34;
    tilt.rotation.x = -Math.PI / 2 + 0.38;
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.95, 64), M.disk);
    tilt.add(disk);
    // dust falling in
    const dust = new THREE.Group();
    dust.position.y = TOP + 0.34;
    const bits = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), M.window);
      b.userData = { a: (i / 14) * Math.PI * 2, r: 0.4 + (i % 5) * 0.12, s: 0.6 + (i % 3) * 0.3 };
      bits.push(b);
      dust.add(b);
    }
    dust.rotation.x = 0.38;
    g.add(core, photon, tilt, dust);
    g.userData.update = (dt, t) => {
      disk.rotation.z = -t * 0.9;
      photon.lookAt(photon.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 1)));
      for (const b of bits) {
        const u = b.userData;
        u.r -= dt * 0.06 * u.s;
        if (u.r < 0.3) u.r = 0.95;
        u.a += dt * (1.6 / u.r) * u.s;
        b.position.set(Math.cos(u.a) * u.r, 0, Math.sin(u.a) * u.r);
      }
    };
  } else if (e.kind === 'core') {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), M.reactor);
    orb.position.y = TOP + DECK + 0.2;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.12, 12), M.hullDark);
    stand.position.y = TOP + DECK + 0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 28), M.teal);
    ring.position.y = TOP + DECK + 0.2;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 28), M.orange);
    ring2.position.y = TOP + DECK + 0.2;
    g.add(orb, stand, ring, ring2);
    g.userData.update = (dt, t) => {
      ring.rotation.set(t * 1.3, t * 0.7, 0);
      ring2.rotation.set(-t * 0.9, 0, t * 1.1);
      orb.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    };
  } else {
    // a wormhole: a ring standing up, with a swirl spinning inside it
    const lane = e.kind === 'oportal';
    const y = lane ? TOP + 0.3 : TOP + DECK + 0.26;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(lane ? 0.25 : 0.2, 0.045, 10, 36), lane ? M.violet : M.cyan);
    ring.position.y = y;
    ring.castShadow = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(lane ? 0.22 : 0.17, 32), lane ? M.swirlViolet : M.swirlCyan);
    disc.position.y = y;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.08, 14), M.hullDark);
    foot.position.y = lane ? TOP + 0.04 : TOP + DECK + 0.04;
    g.add(ring, disc, foot);
    g.userData.ring = ring;
    g.userData.update = (dt, t) => {
      disc.rotation.z = -t * 2.4;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    };
  }
  return g;
}

// ---------------------------------------------------------------------------
// a tile to put on the board
// ---------------------------------------------------------------------------
export function makeTile(def, { variant = 0, shadows = true } = {}) {
  const M = mats();
  if (!templates.has(def.id)) templates.set(def.id, buildTemplate(def));
  const tpl = templates.get(def.id);
  const { SLAB, FACE } = base();
  const group = new THREE.Group();
  const spin = new THREE.Group(); // turned to the tile's rotation
  group.add(spin);
  const slab = new THREE.Mesh(SLAB, M.slab);
  slab.castShadow = shadows;
  slab.receiveShadow = true;
  const face = new THREE.Mesh(FACE, tpl.hole ? M.holeTop : M.tops[variant % M.tops.length]);
  face.receiveShadow = true;
  spin.add(slab, face);
  for (const [name, geo] of Object.entries(tpl.merged)) {
    const mesh = new THREE.Mesh(geo, M[name]);
    mesh.castShadow = shadows && name !== 'laneGlow' && name !== 'lane';
    mesh.receiveShadow = name !== 'laneGlow';
    spin.add(mesh);
  }
  const updates = [];
  for (const e of tpl.extras) {
    const x = makeExtra(e, M);
    spin.add(x);
    if (x.userData.update) updates.push(x.userData.update);
    if (x.userData.dish) group.userData.dish = x.userData.dish;
    if (x.userData.ring) group.userData.portal = x.userData.ring;
  }
  group.userData.spin = spin;
  group.userData.update = (dt, t) => {
    for (const u of updates) u(dt, t);
  };
  group.userData.setTurn = (r) => (spin.rotation.y = (-r * Math.PI) / 2);
  return group;
}
