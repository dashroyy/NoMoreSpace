// Star Bonanza: the star buddies. Every kind of star is a chubby little five-pointed character with a face and a
// costume gag (the joke is in taking the astronomy literally: a red dwarf is a grumpy bearded miner, a neutron star
// is tiny and lifts weights, a pulsar is a DJ who never stops winking). They are cartoons: toon-shaded, with a dark
// outline, and they bob, sway and blink.
//
// Each kind is built once from simple shapes, merged into three meshes (body with its costume, eyes, outline), and
// every star on the table shares those. makeCritter(id) gives a group with an update(t) to call every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './stage.js';
import { star } from '../net.js';

const INK = '#2d1b4e';
const WHITE = '#ffffff';
const CHEEK = '#ff8fb8';
const OUTLINE = 0.045;

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------
const sph = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const halfSph = (r) => new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const cyl = (rt, rb, h, s = 22) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 20) => new THREE.ConeGeometry(r, h, s);
const tor = (R, t, arc = Math.PI * 2, rs = 8, ts = 26) => new THREE.TorusGeometry(R, t, rs, ts, arc);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const halfDisc = (r) => new THREE.CircleGeometry(r, 20, Math.PI, Math.PI); // the lower half: an open mouth
const frame = (p, r = [0, 0, 0]) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));

// pieces of one colour each, merged into a single mesh with vertex colours
class Parts {
  constructor() {
    this.list = [];
  }
  add(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], parent = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    if (parent) m.premultiply(parent);
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = c.r;
      col[i + 1] = c.g;
      col[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    geo.dispose();
    return this;
  }
  build() {
    if (!this.list.length) return null;
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    return merged;
  }
}

// a chubby five-pointed star with rounded points
export function starShape(R = 1, r = 0.6, round = 0.3) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(new THREE.Vector2(Math.cos(a) * rad, Math.sin(a) * rad));
  }
  const shape = new THREE.Shape();
  const lerp = (a, b, t) => new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  for (let i = 0; i < 10; i++) {
    const prev = pts[(i + 9) % 10];
    const p = pts[i];
    const next = pts[(i + 1) % 10];
    const t = i % 2 ? round * 0.55 : round;
    const a = lerp(p, prev, t);
    const b = lerp(p, next, t);
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  shape.closePath();
  return shape;
}

function starBody() {
  const g = new THREE.ExtrudeGeometry(starShape(1, 0.6, 0.32), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 5, curveSegments: 10 });
  g.translate(0, 0, -0.14);
  return g;
}

// the face: eyes (their own mesh, so they can blink), brows, mouth, cheeks
const FRONT = 0.36;
function face(body, eyes, { look = 'open', brows = null, mouth = 'smile', cheeks = true, eyeY = 0.1, wide = 0.21 } = {}) {
  const openEye = (x) => {
    eyes.add(sph(0.15), WHITE, { p: [x, 0, FRONT], s: [1, 1.2, 0.45] });
    eyes.add(sph(0.082), INK, { p: [x - Math.sign(x) * 0.02, -0.02, FRONT + 0.05], s: [1, 1.12, 0.5] });
    eyes.add(sph(0.03), WHITE, { p: [x - Math.sign(x) * 0.05 + 0.02, 0.04, FRONT + 0.09] });
  };
  const closedEye = (x, happy = true) => body.add(tor(0.09, 0.024, Math.PI, 6, 12), INK, { p: [x, eyeY + (happy ? 0.03 : -0.02), FRONT + 0.02], r: [0, 0, happy ? 0 : Math.PI] });
  if (look === 'open') [-wide, wide].forEach(openEye);
  if (look === 'closed') [-wide, wide].forEach((x) => closedEye(x, false));
  if (look === 'wink') {
    openEye(wide);
    closedEye(-wide, true);
  }
  if (brows) {
    const tilt = { angry: 0.42, worried: -0.38, raised: -0.12 }[brows];
    for (const x of [-wide, wide]) body.add(box(0.17, 0.045, 0.04), INK, { p: [x, eyeY + 0.23 + (brows === 'raised' ? 0.05 : 0), FRONT + 0.02], r: [0, 0, x < 0 ? -tilt : tilt] });
  }
  const my = eyeY - 0.26;
  if (mouth === 'smile') body.add(tor(0.11, 0.028, Math.PI, 6, 16), INK, { p: [0, my + 0.06, FRONT + 0.02], r: [0, 0, Math.PI] });
  if (mouth === 'grin') {
    body.add(halfDisc(0.15), INK, { p: [0, my + 0.08, FRONT + 0.03] });
    body.add(halfDisc(0.075), '#ff6b8f', { p: [0, my + 0.0, FRONT + 0.035] });
  }
  if (mouth === 'smirk') body.add(tor(0.1, 0.028, Math.PI * 0.8, 6, 14), INK, { p: [0.04, my + 0.05, FRONT + 0.02], r: [0, 0, Math.PI + 0.35] });
  if (mouth === 'frown') body.add(tor(0.09, 0.028, Math.PI, 6, 14), INK, { p: [0, my - 0.03, FRONT + 0.02] });
  if (mouth === 'o') {
    body.add(sph(0.07), INK, { p: [0, my, FRONT], s: [1, 1.15, 0.35] });
  }
  if (mouth === 'grit') {
    body.add(box(0.27, 0.11, 0.02), INK, { p: [0, my + 0.02, FRONT + 0.01] });
    body.add(box(0.22, 0.065, 0.03), WHITE, { p: [0, my + 0.02, FRONT + 0.025] });
  }
  if (cheeks) for (const x of [-0.37, 0.37]) body.add(sph(0.075), CHEEK, { p: [x, eyeY - 0.17, FRONT - 0.04], s: [1.5, 0.9, 0.35] });
  return eyeY;
}

const beard = (b, y = -0.34, s = 1) => b.add(sph(0.36 * s), '#f7f3ea', { p: [0, y, 0.25], s: [1.3, 1.0, 0.6] });

// ---------------------------------------------------------------------------
// the eleven kinds: a face and a costume each
// ---------------------------------------------------------------------------
const KINDS = {
  'red-dwarf'(b, e) {
    face(b, e, { brows: 'angry', mouth: null, cheeks: false });
    beard(b);
    for (const x of [-1, 1]) b.add(sph(0.1), '#f7f3ea', { p: [x * 0.11, -0.12, 0.39], s: [1.7, 0.8, 0.6], r: [0, 0, -x * 0.3] });
    const hat = frame([0, 0.76, 0.02], [-0.18, 0, 0]);
    b.add(halfSph(0.37), '#ffcf2e', { parent: hat });
    b.add(cyl(0.48, 0.48, 0.05, 28), '#ffcf2e', { parent: hat });
    b.add(cyl(0.09, 0.09, 0.12), '#fff7c2', { parent: hat, p: [0, 0.2, 0.32], r: [1.35, 0, 0] });
  },
  'brown-dwarf'(b, e) {
    face(b, e, { look: 'closed', mouth: 'o', cheeks: true });
    const cap = frame([0.08, 0.76, 0], [0, 0, -0.75]);
    b.add(cone(0.33, 0.95), '#6b7cff', { parent: cap, p: [0, 0.47, 0] });
    b.add(tor(0.32, 0.075, Math.PI * 2, 8, 22), WHITE, { parent: cap, r: [Math.PI / 2, 0, 0] });
    b.add(sph(0.12), WHITE, { parent: cap, p: [0, 0.97, 0] });
  },
  'orange-dwarf'(b, e) {
    face(b, e, { mouth: null, cheeks: true });
    const hat = frame([0, 0.74, 0], [-0.1, 0, 0.12]);
    b.add(cone(0.4, 1.05), '#e8423f', { parent: hat, p: [0, 0.52, 0] });
    b.add(tor(0.39, 0.055, Math.PI * 2, 8, 22), '#b92a28', { parent: hat, r: [Math.PI / 2, 0, 0] });
    b.add(cone(0.33, 0.62), '#f7f3ea', { p: [0, -0.44, 0.22], r: [Math.PI, 0, 0], s: [1, 1, 0.55] });
    b.add(sph(0.095), '#ffb39e', { p: [0, -0.04, 0.42] });
  },
  'yellow-dwarf'(b, e) {
    face(b, e, { mouth: 'grin', cheeks: true });
    const hat = frame([0, 0.8, 0], [-0.28, 0, -0.12]);
    b.add(cyl(0.64, 0.64, 0.045, 30), '#f3d88e', { parent: hat });
    b.add(cyl(0.27, 0.31, 0.25), '#f3d88e', { parent: hat, p: [0, 0.14, 0] });
    b.add(tor(0.3, 0.045, Math.PI * 2, 8, 22), '#ff5d8f', { parent: hat, p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0] });
    b.add(sph(0.08), '#ff5d8f', { parent: hat, p: [0.27, 0.1, 0.12] });
    b.add(sph(0.05), '#ffe066', { parent: hat, p: [0.3, 0.12, 0.18] });
  },
  'white-dwarf'(b, e) {
    face(b, e, { mouth: 'smile', cheeks: true });
    for (const x of [-0.21, 0.21]) b.add(tor(0.15, 0.024, Math.PI * 2, 6, 22), INK, { p: [x, 0.1, FRONT + 0.08] });
    b.add(box(0.12, 0.026, 0.02), INK, { p: [0, 0.12, FRONT + 0.08] });
    for (const x of [-1, 1]) {
      b.add(sph(0.09), WHITE, { p: [x * 0.22, 0.34, FRONT], s: [1.9, 0.7, 0.5] });
      b.add(sph(0.1), WHITE, { p: [x * 0.1, -0.09, FRONT + 0.03], s: [1.7, 0.75, 0.6], r: [0, 0, -x * 0.25] });
    }
  },
  'blue-giant'(b, e) {
    face(b, e, { brows: 'raised', mouth: 'grin', cheeks: false });
    b.add(box(1.08, 0.15, 0.2), '#ff4d6d', { p: [0, 0.42, 0.3] });
    b.add(box(0.1, 0.24, 0.05), '#ff4d6d', { p: [0.56, 0.32, 0.3], r: [0, 0, -0.5] });
    b.add(box(0.1, 0.2, 0.05), '#ff4d6d', { p: [0.62, 0.28, 0.27], r: [0, 0, -0.9] });
  },
  'red-giant'(b, e) {
    face(b, e, { brows: 'worried', mouth: 'o', cheeks: false });
    for (const x of [-1, 1]) b.add(sph(0.13), '#ff9ab0', { p: [x * 0.38, -0.08, 0.32], s: [1.4, 1, 0.42] });
    for (const [x, y, z] of [[0.56, 0.5, 0.25], [-0.62, 0.42, 0.2], [0.42, 0.74, 0.16]]) b.add(sph(0.075), '#9fe4ff', { p: [x, y, z], s: [0.8, 1.35, 0.8] });
  },
  'neutron-star'(b, e) {
    face(b, e, { brows: 'angry', mouth: 'grit', cheeks: false });
    b.add(cyl(0.035, 0.035, 1.5, 10), '#a7afc2', { p: [0, 1.28, 0], r: [0, 0, Math.PI / 2] });
    for (const x of [-1, 1]) {
      b.add(cyl(0.23, 0.23, 0.1), '#3a3f55', { p: [x * 0.52, 1.28, 0], r: [0, 0, Math.PI / 2] });
      b.add(cyl(0.18, 0.18, 0.08), '#565d7a', { p: [x * 0.63, 1.28, 0], r: [0, 0, Math.PI / 2] });
    }
    b.add(sph(0.07), '#9fe4ff', { p: [0.5, 0.55, 0.25], s: [0.8, 1.35, 0.8] });
  },
  pulsar(b, e) {
    face(b, e, { look: 'wink', mouth: 'grin', cheeks: true });
    b.add(tor(0.8, 0.055, Math.PI, 8, 28), '#2b2b3a', { p: [0, 0.36, 0.05] });
    for (const x of [-1, 1]) {
      b.add(cyl(0.24, 0.24, 0.16), '#ff4fd8', { p: [x * 0.8, 0.36, 0.08], r: [0, 0, Math.PI / 2] });
      b.add(cyl(0.15, 0.15, 0.17), '#2b2b3a', { p: [x * 0.87, 0.36, 0.08], r: [0, 0, Math.PI / 2] });
    }
  },
  quasar(b, e) {
    face(b, e, { look: 'none', mouth: 'smirk', cheeks: false });
    for (const x of [-1, 1]) {
      b.add(box(0.29, 0.18, 0.05), '#14121f', { p: [x * 0.2, 0.1, FRONT + 0.04], r: [0, 0, x * 0.06] });
      b.add(box(0.05, 0.15, 0.01), WHITE, { p: [x * 0.2 - 0.06, 0.11, FRONT + 0.07], r: [0, 0, 0.5] });
    }
    b.add(box(0.16, 0.035, 0.03), '#14121f', { p: [0, 0.15, FRONT + 0.04] });
    // a gold crown, and a medal on the belly
    b.add(cyl(0.34, 0.36, 0.2, 24), '#ffc531', { p: [0, 0.86, 0] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      b.add(cone(0.08, 0.22, 10), '#ffc531', { p: [Math.sin(a) * 0.31, 1.06, Math.cos(a) * 0.31] });
      b.add(sph(0.045), i % 2 ? '#ff4d6d' : '#4aa8ff', { p: [Math.sin(a) * 0.36, 0.86, Math.cos(a) * 0.36] });
    }
    b.add(cyl(0.12, 0.12, 0.05, 20), '#ffc531', { p: [0, -0.45, FRONT], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.ExtrudeGeometry(starShape(0.08, 0.04, 0.2), { depth: 0.02, bevelEnabled: false, curveSegments: 3 }), '#fff2b0', { p: [0, -0.45, FRONT + 0.03] });
  },
  magnetar(b, e) {
    face(b, e, { brows: 'raised', mouth: 'smile', cheeks: true });
    b.add(tor(0.32, 0.11, Math.PI, 10, 24), '#e8323f', { p: [0, 1.0, 0.04] });
    for (const x of [-1, 1]) b.add(cyl(0.11, 0.11, 0.16), '#e6e9f2', { p: [x * 0.32, 0.92, 0.04] });
    // a spoon and a key stuck to its sides
    b.add(cyl(0.03, 0.03, 0.5, 8), '#c7ccd8', { p: [0.98, -0.32, 0.22], r: [0, 0, 0.5] });
    b.add(sph(0.12), '#c7ccd8', { p: [1.12, -0.1, 0.24], s: [0.8, 1.25, 0.35], r: [0, 0, 0.5] });
    b.add(cyl(0.03, 0.03, 0.42, 8), '#ffd23f', { p: [-0.98, -0.3, 0.22], r: [0, 0, -0.5] });
    b.add(tor(0.08, 0.03, Math.PI * 2, 6, 14), '#ffd23f', { p: [-1.1, -0.11, 0.22] });
  },
};

// the dark cartoon outline: the body pushed out along its smoothed normals, drawn from the inside
function inflate(geometry, thickness) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const sums = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) || [0, 0, 0];
    s[0] += nor.getX(i);
    s[1] += nor.getY(i);
    s[2] += nor.getZ(i);
    sums.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i));
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = pos.getX(i) + (s[0] / len) * thickness;
    out[i * 3 + 1] = pos.getY(i) + (s[1] / len) * thickness;
    out[i * 3 + 2] = pos.getZ(i) + (s[2] / len) * thickness;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return g;
}

const MATS = {};
const mats = () => {
  if (!MATS.body) {
    MATS.body = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    MATS.eyes = new THREE.MeshBasicMaterial({ vertexColors: true });
    MATS.line = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  }
  return MATS;
};

const templates = new Map();
function template(id) {
  if (templates.has(id)) return templates.get(id);
  const d = star(id);
  const body = new Parts();
  const eyes = new Parts();
  body.add(starBody(), d?.color || '#ffd93d');
  (KINDS[id] || KINDS['yellow-dwarf'])(body, eyes);
  const bodyGeo = body.build();
  const t = { body: bodyGeo, eyes: eyes.build(), line: inflate(bodyGeo, OUTLINE) };
  templates.set(id, t);
  return t;
}

// one star buddy: { root, update(t) }. The root is what you place; inside it the buddy bobs, sways and blinks.
export function makeCritter(id) {
  const t = template(id);
  const m = mats();
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  inner.add(new THREE.Mesh(t.line, m.line));
  inner.add(new THREE.Mesh(t.body, m.body));
  let eyes = null;
  if (t.eyes) {
    eyes = new THREE.Mesh(t.eyes, m.eyes);
    eyes.position.y = 0.1; // (the eyes are built round y = 0 and lifted to the face, so they blink about their own middle)
    inner.add(eyes);
  }
  const size = star(id)?.size || 1;
  const phase = Math.random() * 10;
  let nextBlink = 1 + Math.random() * 4;
  let hop = 0;
  root.userData = {
    id,
    size,
    critter: true,
    // a little jump (when it lands somewhere)
    hop(power = 1) {
      hop = power;
    },
    update(time, dt = 0.016) {
      const s = time + phase;
      hop = Math.max(0, hop - dt * 2.2);
      const jump = Math.sin((1 - hop) * Math.PI) * hop * 0.9;
      inner.position.y = Math.sin(s * 2.1) * 0.06 + jump;
      inner.rotation.z = Math.sin(s * 1.3) * 0.08;
      const squash = 1 + Math.sin(s * 4.2) * 0.025;
      inner.scale.set(1 / squash, squash, 1);
      if (eyes) {
        nextBlink -= dt;
        if (nextBlink < 0) nextBlink = 2 + Math.random() * 4;
        eyes.scale.y = nextBlink < 0.12 ? 0.12 : 1;
      }
    },
  };
  return root;
}

// ---------------------------------------------------------------------------
// a gold Star Coin, and the back of a card (flying out of the UFO when someone draws)
// ---------------------------------------------------------------------------
let COIN = null;
export function makeCoin() {
  if (!COIN) {
    const p = new Parts();
    p.add(cyl(0.34, 0.34, 0.1, 28), '#ffc531');
    p.add(cyl(0.27, 0.27, 0.11, 28), '#ffd95e');
    const s = new THREE.ExtrudeGeometry(starShape(0.17, 0.08, 0.2), { depth: 0.03, bevelEnabled: false, curveSegments: 4 });
    p.add(s.clone(), '#fff2b0', { p: [0, 0.06, 0], r: [-Math.PI / 2, 0, 0] });
    p.add(s, '#fff2b0', { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0] });
    const body = p.build();
    COIN = { body, line: inflate(body, 0.03) };
  }
  const m = mats();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(COIN.line, m.line), new THREE.Mesh(COIN.body, m.body));
  return g;
}

let CARD = null;
export function makeCardBack() {
  if (!CARD) {
    const p = new Parts();
    p.add(box(0.56, 0.05, 0.78), '#7b5cff');
    p.add(new THREE.ExtrudeGeometry(starShape(0.18, 0.09, 0.25), { depth: 0.02, bevelEnabled: false, curveSegments: 4 }), '#ffd93d', { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0] });
    const body = p.build();
    CARD = { body, line: inflate(body, 0.03) };
  }
  const m = mats();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(CARD.line, m.line), new THREE.Mesh(CARD.body, m.body));
  return g;
}
