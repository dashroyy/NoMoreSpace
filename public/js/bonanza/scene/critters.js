// Star Bonanza: the star buddies. Every kind of star is a chubby little five-pointed character with a face and a
// costume gag (and a pun for a name: a Rock Star is a grumpy bearded miner, a Super Star is tiny and lifts weights,
// a Pop Star is a DJ who never stops winking). They are cel-shaded cartoons: flat bands of
// colour, a thick ink outline and a glint, and they are never still: they bob, sway and blink, their costumes move
// (the Super Star really does lift its dumbbell), they pull a random gag every few seconds (a hop, a spin, a wiggle,
// a look round) and they react to what happens to them (cheer, sulk, gasp).
//
// Each kind is built once from simple shapes and merged into four meshes (body, eyes, mouth, costume), and every star
// of that kind shares them. makeCritter(id) gives a group with an update(t, dt) to call every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, celify, ink, INK as INK_COLOR } from './stage.js';
import { star } from '../net.js';

const INK = '#2d1b4e';
const WHITE = '#ffffff';
const CHEEK = '#ff8fb8';

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

// the face: eyes (their own mesh, so they can blink and squint), brows and cheeks (in the body), the mouth (its own
// mesh, so it can open and flip into a frown)
const FRONT = 0.36;
const MOUTH_Y = -0.16;
function face(body, eyes, mouth, { look = 'open', brows = null, mouth: kind = 'smile', cheeks = true, eyeY = 0.1, wide = 0.21 } = {}) {
  const openEye = (x) => {
    eyes.add(sph(0.15), WHITE, { p: [x, 0, FRONT], s: [1, 1.2, 0.45] });
    eyes.add(sph(0.082), INK, { p: [x - Math.sign(x) * 0.02, -0.02, FRONT + 0.05], s: [1, 1.12, 0.5] });
    eyes.add(sph(0.03), WHITE, { p: [x - Math.sign(x) * 0.05 + 0.02, 0.04, FRONT + 0.09] });
  };
  const closedEye = (x, happy = true) => eyes.add(tor(0.09, 0.024, Math.PI, 6, 12), INK, { p: [x, happy ? 0.03 : -0.02, FRONT + 0.02], r: [0, 0, happy ? 0 : Math.PI] });
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
  const my = MOUTH_Y; // (the mouth is built about its own middle and lifted into place)
  const at = (y) => y - my;
  if (kind === 'smile') mouth.add(tor(0.11, 0.028, Math.PI, 6, 16), INK, { p: [0, at(my + 0.06), FRONT + 0.02], r: [0, 0, Math.PI] });
  if (kind === 'grin') {
    mouth.add(halfDisc(0.15), INK, { p: [0, at(my + 0.08), FRONT + 0.03] });
    mouth.add(halfDisc(0.075), '#ff6b8f', { p: [0, at(my), FRONT + 0.035] });
  }
  if (kind === 'smirk') mouth.add(tor(0.1, 0.028, Math.PI * 0.8, 6, 14), INK, { p: [0.04, at(my + 0.05), FRONT + 0.02], r: [0, 0, Math.PI + 0.35] });
  if (kind === 'frown') mouth.add(tor(0.09, 0.028, Math.PI, 6, 14), INK, { p: [0, at(my - 0.03), FRONT + 0.02] });
  if (kind === 'o') mouth.add(sph(0.07), INK, { p: [0, at(my), FRONT], s: [1, 1.15, 0.35] });
  if (kind === 'grit') {
    mouth.add(box(0.27, 0.11, 0.02), INK, { p: [0, at(my + 0.02), FRONT + 0.01] });
    mouth.add(box(0.22, 0.065, 0.03), WHITE, { p: [0, at(my + 0.02), FRONT + 0.025] });
  }
  if (cheeks) for (const x of [-0.37, 0.37]) body.add(sph(0.075), CHEEK, { p: [x, eyeY - 0.17, FRONT - 0.04], s: [1.5, 0.9, 0.35] });
}

const beard = (b, y = -0.34, s = 1) => b.add(sph(0.36 * s), '#f7f3ea', { p: [0, y, 0.25], s: [1.3, 1.0, 0.6] });

// ---------------------------------------------------------------------------
// the twelve kinds: a face and a costume each. (b: body, e: eyes, m: mouth, a: the costume that moves on its own)
// ---------------------------------------------------------------------------
const KINDS = {
  'red-dwarf'(b, e, m, a) {
    face(b, e, m, { brows: 'angry', mouth: null, cheeks: false });
    beard(b);
    for (const x of [-1, 1]) b.add(sph(0.1), '#f7f3ea', { p: [x * 0.11, -0.12, 0.39], s: [1.7, 0.8, 0.6], r: [0, 0, -x * 0.3] });
    const hat = frame([0, 0.76, 0.02], [-0.18, 0, 0]);
    a.add(halfSph(0.37), '#ffcf2e', { parent: hat });
    a.add(cyl(0.48, 0.48, 0.05, 28), '#ffcf2e', { parent: hat });
    a.add(cyl(0.09, 0.09, 0.12), '#fff7c2', { parent: hat, p: [0, 0.2, 0.32], r: [1.35, 0, 0] });
  },
  'brown-dwarf'(b, e, m, a) {
    face(b, e, m, { look: 'closed', mouth: 'o', cheeks: true });
    const cap = frame([0.08, 0.76, 0], [0, 0, -0.75]);
    a.add(cone(0.33, 0.95), '#6b7cff', { parent: cap, p: [0, 0.47, 0] });
    a.add(tor(0.32, 0.075, Math.PI * 2, 8, 22), WHITE, { parent: cap, r: [Math.PI / 2, 0, 0] });
    a.add(sph(0.12), WHITE, { parent: cap, p: [0, 0.97, 0] });
  },
  'orange-dwarf'(b, e, m, a) {
    face(b, e, m, { mouth: null, cheeks: true });
    const hat = frame([0, 0.74, 0], [-0.1, 0, 0.12]);
    a.add(cone(0.4, 1.05), '#e8423f', { parent: hat, p: [0, 0.52, 0] });
    a.add(tor(0.39, 0.055, Math.PI * 2, 8, 22), '#b92a28', { parent: hat, r: [Math.PI / 2, 0, 0] });
    b.add(cone(0.33, 0.62), '#f7f3ea', { p: [0, -0.44, 0.22], r: [Math.PI, 0, 0], s: [1, 1, 0.55] });
    b.add(sph(0.095), '#ffb39e', { p: [0, -0.04, 0.42] });
  },
  'yellow-dwarf'(b, e, m, a) {
    face(b, e, m, { mouth: 'grin', cheeks: true });
    const hat = frame([0, 0.8, 0], [-0.28, 0, -0.12]);
    a.add(cyl(0.64, 0.64, 0.045, 30), '#f3d88e', { parent: hat });
    a.add(cyl(0.27, 0.31, 0.25), '#f3d88e', { parent: hat, p: [0, 0.14, 0] });
    a.add(tor(0.3, 0.045, Math.PI * 2, 8, 22), '#ff5d8f', { parent: hat, p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0] });
    a.add(sph(0.08), '#ff5d8f', { parent: hat, p: [0.27, 0.1, 0.12] });
    a.add(sph(0.05), '#ffe066', { parent: hat, p: [0.3, 0.12, 0.18] });
  },
  'white-dwarf'(b, e, m, a) {
    face(b, e, m, { mouth: 'smile', cheeks: true });
    for (const x of [-0.21, 0.21]) a.add(tor(0.15, 0.024, Math.PI * 2, 6, 22), INK, { p: [x, 0.1, FRONT + 0.08] });
    a.add(box(0.12, 0.026, 0.02), INK, { p: [0, 0.12, FRONT + 0.08] });
    for (const x of [-1, 1]) {
      b.add(sph(0.09), WHITE, { p: [x * 0.22, 0.34, FRONT], s: [1.9, 0.7, 0.5] });
      b.add(sph(0.1), WHITE, { p: [x * 0.1, -0.09, FRONT + 0.03], s: [1.7, 0.75, 0.6], r: [0, 0, -x * 0.25] });
    }
  },
  'stink-star'(b, e, m, a) {
    face(b, e, m, { brows: 'raised', mouth: 'smirk', cheeks: false });
    // a cloud of flies and green stink wisps that never leaves (they all orbit its head, because the costume turns)
    const fly = (ang, dy, r) => {
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      a.add(sph(0.12), '#14121f', { p: [x, 0.7 + dy, z] });
      for (const w of [-1, 1]) a.add(sph(0.11), '#f2fbff', { p: [x - Math.sin(ang) * w * 0.12, 0.84 + dy, z + Math.cos(ang) * w * 0.12], s: [1, 0.3, 1] });
    };
    [0, 2.1, 4.2].forEach((ang, i) => fly(ang, [0.05, -0.1, 0.18][i], 0.95));
    [1.0, 3.1, 5.2].forEach((ang, i) => a.add(sph(0.26), i % 2 ? '#b9e35a' : '#8fbf2f', { p: [Math.cos(ang) * 0.6, 1.0 + i * 0.1, Math.sin(ang) * 0.6], s: [1.3, 0.8, 1.3] }));
    // stripes of green gas on the tummy, like it has been at the beans
    b.add(sph(0.12), '#7fa72a', { p: [-0.18, -0.38, FRONT - 0.02], s: [1.5, 0.7, 0.4] });
    b.add(sph(0.09), '#7fa72a', { p: [0.22, -0.45, FRONT - 0.02], s: [1.5, 0.7, 0.4] });
  },
  'blue-giant'(b, e, m, a) {
    face(b, e, m, { brows: 'raised', mouth: 'grin', cheeks: false });
    a.add(box(1.08, 0.15, 0.2), '#ff4d6d', { p: [0, 0.42, 0.3] });
    a.add(box(0.1, 0.24, 0.05), '#ff4d6d', { p: [0.56, 0.32, 0.3], r: [0, 0, -0.5] });
    a.add(box(0.1, 0.2, 0.05), '#ff4d6d', { p: [0.62, 0.28, 0.27], r: [0, 0, -0.9] });
  },
  'red-giant'(b, e, m, a) {
    face(b, e, m, { brows: 'worried', mouth: 'o', cheeks: false });
    for (const x of [-1, 1]) b.add(sph(0.13), '#ff9ab0', { p: [x * 0.38, -0.08, 0.32], s: [1.4, 1, 0.42] });
    for (const [x, y, z] of [[0.56, 0.5, 0.25], [-0.62, 0.42, 0.2], [0.42, 0.74, 0.16]]) a.add(sph(0.075), '#9fe4ff', { p: [x, y, z], s: [0.8, 1.35, 0.8] });
  },
  'neutron-star'(b, e, m, a) {
    face(b, e, m, { brows: 'angry', mouth: 'grit', cheeks: false });
    a.add(cyl(0.035, 0.035, 1.5, 10), '#a7afc2', { p: [0, 1.28, 0], r: [0, 0, Math.PI / 2] });
    for (const x of [-1, 1]) {
      a.add(cyl(0.23, 0.23, 0.1), '#3a3f55', { p: [x * 0.52, 1.28, 0], r: [0, 0, Math.PI / 2] });
      a.add(cyl(0.18, 0.18, 0.08), '#565d7a', { p: [x * 0.63, 1.28, 0], r: [0, 0, Math.PI / 2] });
    }
    b.add(sph(0.07), '#9fe4ff', { p: [0.5, 0.55, 0.25], s: [0.8, 1.35, 0.8] });
  },
  pulsar(b, e, m, a) {
    face(b, e, m, { look: 'wink', mouth: 'grin', cheeks: true });
    a.add(tor(0.8, 0.055, Math.PI, 8, 28), '#2b2b3a', { p: [0, 0.36, 0.05] });
    for (const x of [-1, 1]) {
      a.add(cyl(0.24, 0.24, 0.16), '#ff4fd8', { p: [x * 0.8, 0.36, 0.08], r: [0, 0, Math.PI / 2] });
      a.add(cyl(0.15, 0.15, 0.17), '#2b2b3a', { p: [x * 0.87, 0.36, 0.08], r: [0, 0, Math.PI / 2] });
    }
  },
  quasar(b, e, m, a) {
    face(b, e, m, { look: 'none', mouth: 'smirk', cheeks: false });
    for (const x of [-1, 1]) {
      b.add(box(0.29, 0.18, 0.05), '#14121f', { p: [x * 0.2, 0.1, FRONT + 0.04], r: [0, 0, x * 0.06] });
      b.add(box(0.05, 0.15, 0.01), WHITE, { p: [x * 0.2 - 0.06, 0.11, FRONT + 0.07], r: [0, 0, 0.5] });
    }
    b.add(box(0.16, 0.035, 0.03), '#14121f', { p: [0, 0.15, FRONT + 0.04] });
    // a gold crown, and a medal on the belly
    a.add(cyl(0.34, 0.36, 0.2, 24), '#ffc531', { p: [0, 0.86, 0] });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.3;
      a.add(cone(0.08, 0.22, 10), '#ffc531', { p: [Math.sin(ang) * 0.31, 1.06, Math.cos(ang) * 0.31] });
      a.add(sph(0.045), i % 2 ? '#ff4d6d' : '#4aa8ff', { p: [Math.sin(ang) * 0.36, 0.86, Math.cos(ang) * 0.36] });
    }
    b.add(cyl(0.12, 0.12, 0.05, 20), '#ffc531', { p: [0, -0.45, FRONT], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.ExtrudeGeometry(starShape(0.08, 0.04, 0.2), { depth: 0.02, bevelEnabled: false, curveSegments: 3 }), '#fff2b0', { p: [0, -0.45, FRONT + 0.03] });
  },
  magnetar(b, e, m, a) {
    face(b, e, m, { brows: 'raised', mouth: 'smile', cheeks: true });
    a.add(tor(0.32, 0.11, Math.PI, 10, 24), '#e8323f', { p: [0, 1.0, 0.04] });
    for (const x of [-1, 1]) a.add(cyl(0.11, 0.11, 0.16), '#e6e9f2', { p: [x * 0.32, 0.92, 0.04] });
    // a spoon and a key stuck to its sides
    a.add(cyl(0.03, 0.03, 0.5, 8), '#c7ccd8', { p: [0.98, -0.32, 0.22], r: [0, 0, 0.5] });
    a.add(sph(0.12), '#c7ccd8', { p: [1.12, -0.1, 0.24], s: [0.8, 1.25, 0.35], r: [0, 0, 0.5] });
    a.add(cyl(0.03, 0.03, 0.42, 8), '#ffd23f', { p: [-0.98, -0.3, 0.22], r: [0, 0, -0.5] });
    a.add(tor(0.08, 0.03, Math.PI * 2, 6, 14), '#ffd23f', { p: [-1.1, -0.11, 0.22] });
  },
};

// how each costume moves: its pivot (where it hangs from) and what it does every frame (t in seconds)
const MOVES = {
  'red-dwarf': { pivot: [0, 0.76, 0], fn: (g, t) => ((g.position.y += Math.abs(Math.sin(t * 3)) * 0.04), (g.rotation.z = Math.sin(t * 6) * 0.06)) },
  'brown-dwarf': { pivot: [0.08, 0.76, 0], fn: (g, t) => ((g.rotation.z = Math.sin(t * 1.2) * 0.22), (g.position.x += Math.sin(t * 1.2 - 0.6) * 0.05)) },
  'orange-dwarf': { pivot: [0, 0.74, 0], fn: (g, t) => ((g.rotation.z = Math.sin(t * 2.4) * 0.12), (g.rotation.x = Math.sin(t * 1.7) * 0.05)) },
  'yellow-dwarf': { pivot: [0, 0.8, 0], fn: (g, t) => ((g.rotation.z = Math.sin(t * 3.1) * 0.1), (g.position.y += Math.abs(Math.sin(t * 3.1)) * 0.05)) },
  'white-dwarf': { pivot: [0, 0.1, FRONT + 0.08], fn: (g, t) => ((g.position.y -= Math.max(0, Math.sin(t * 0.8)) * 0.06), (g.rotation.z = Math.sin(t * 0.8) * 0.05)) },
  'blue-giant': { pivot: [0, 0.42, 0.3], fn: (g, t) => ((g.rotation.z = Math.sin(t * 2.2) * 0.05), (g.scale.y = 1 + Math.sin(t * 4.4) * 0.12)) },
  'red-giant': { pivot: [0.5, 0.6, 0.25], fn: (g, t) => ((g.position.y -= ((t * 0.9) % 1) * 0.9), g.scale.setScalar(1 - ((t * 0.9) % 1) * 0.6)) },
  'neutron-star': { pivot: [0, 1.28, 0], fn: (g, t) => ((g.position.y += Math.abs(Math.sin(t * 2.2)) * 0.34), (g.rotation.z = Math.sin(t * 2.2) * 0.1)) },
  'stink-star': { pivot: [0, 0.65, 0], fn: (g, t) => ((g.rotation.y = t * 2.6), (g.position.y += Math.sin(t * 3) * 0.05)) },
  pulsar: { pivot: [0, 0.36, 0.05], fn: (g, t) => ((g.rotation.z = Math.sin(t * 7.4) * 0.14), (g.position.y += Math.abs(Math.sin(t * 3.7)) * 0.06)) },
  quasar: { pivot: [0, 0.86, 0], fn: (g, t) => ((g.position.y += Math.abs(Math.sin(t * 2.6)) * 0.07), (g.rotation.z = Math.sin(t * 2.6) * 0.1)) },
  magnetar: { pivot: [0, 0.5, 0.1], fn: (g, t) => ((g.rotation.z = Math.sin(t * 5.2) * 0.07), g.scale.setScalar(1 + Math.sin(t * 5.2) * 0.03)) },
};

// each kind's way of being a character: bounce speed, sway, breathing and which gags it pulls
const PERSONA = {
  'red-dwarf': { bounce: 1.6, sway: 0.5, breathe: 0.02, gags: ['stomp', 'stomp', 'wiggle', 'look'] },
  'brown-dwarf': { bounce: 0.7, sway: 0.7, breathe: 0.07, gags: ['nod', 'nod', 'look'] },
  'orange-dwarf': { bounce: 1.4, sway: 1, breathe: 0.03, gags: ['wiggle', 'hop', 'look'] },
  'yellow-dwarf': { bounce: 2.4, sway: 0.8, breathe: 0.03, gags: ['hop', 'hop', 'spin', 'wiggle'] },
  'white-dwarf': { bounce: 0.8, sway: 1.2, breathe: 0.04, gags: ['look', 'nod', 'wiggle'] },
  'blue-giant': { bounce: 1.2, sway: 0.5, breathe: 0.05, gags: ['flex', 'flex', 'hop'] },
  'red-giant': { bounce: 1.5, sway: 0.4, breathe: 0.08, gags: ['shiver', 'shiver', 'look'] },
  'neutron-star': { bounce: 2.2, sway: 0.3, breathe: 0.02, gags: ['flex', 'stomp', 'hop'] },
  'stink-star': { bounce: 1.7, sway: 0.9, breathe: 0.06, gags: ['fart', 'fart', 'fart', 'wiggle', 'look'] },
  pulsar: { bounce: 3.7, sway: 1.2, breathe: 0.02, gags: ['spin', 'wiggle', 'hop'] },
  quasar: { bounce: 1.3, sway: 1.4, breathe: 0.02, gags: ['spin', 'look', 'flex'] },
  magnetar: { bounce: 1.8, sway: 0.9, breathe: 0.03, gags: ['wiggle', 'spin', 'hop'] },
};

const MATS = {};
const mats = () => {
  if (!MATS.body) {
    MATS.body = celify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }), 1);
    MATS.face = new THREE.MeshBasicMaterial({ vertexColors: true });
    MATS.shadow = new THREE.MeshBasicMaterial({ color: INK_COLOR, transparent: true, opacity: 0.3, depthWrite: false });
  }
  return MATS;
};
const SHADOW_GEO = new THREE.CircleGeometry(1, 28);

const templates = new Map();
function template(id) {
  if (templates.has(id)) return templates.get(id);
  const d = star(id);
  const b = new Parts();
  const e = new Parts();
  const m = new Parts();
  const a = new Parts();
  b.add(starBody(), d?.color || '#ffd93d');
  (KINDS[id] || KINDS['yellow-dwarf'])(b, e, m, a);
  const t = { body: b.build(), eyes: e.build(), mouth: m.build(), costume: a.build() };
  templates.set(id, t);
  return t;
}

// the cheers and sulks: how long each lasts
const REACTIONS = { cheer: 1.3, sad: 1.5, wow: 0.9, shake: 0.8 };
const GAG_TIME = { fart: 1.3, hop: 0.7, spin: 0.9, wiggle: 0.8, look: 1.6, stomp: 0.7, nod: 1.5, flex: 1.2, shiver: 1.0 };

// one star buddy: a group you place. Inside it the buddy bobs, sways, blinks, wears its moving costume and pulls gags.
//   hop(power)       a little jump (it landed somewhere)
//   react(name)      'cheer' (jump and spin, squinty smile), 'sad' (droop and frown), 'wow' (stretch, big eyes), 'shake'
//   update(time, dt) call every frame
export function makeCritter(id, { outline = 3.2 } = {}) {
  const t = template(id);
  const m = mats();
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  inner.add(ink(new THREE.Mesh(t.body, m.body), outline));
  let eyes = null;
  let mouth = null;
  let costume = null;
  const move = MOVES[id];
  if (t.eyes) {
    eyes = new THREE.Mesh(t.eyes, m.face);
    eyes.position.y = 0.1; // (the eyes are built round y = 0 and lifted to the face, so they blink about their own middle)
    inner.add(eyes);
  }
  if (t.mouth) {
    mouth = new THREE.Mesh(t.mouth, m.face);
    mouth.position.y = MOUTH_Y;
    inner.add(mouth);
  }
  if (t.costume) {
    const piece = ink(new THREE.Mesh(t.costume, m.body), outline * 0.7);
    costume = new THREE.Group();
    if (move) piece.position.set(-move.pivot[0], -move.pivot[1], -move.pivot[2]);
    costume.add(piece);
    if (move) costume.position.set(...move.pivot);
    inner.add(costume);
  }
  // a flat shadow on the ground (the farm puts it at the right height)
  const shadow = new THREE.Mesh(SHADOW_GEO, m.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.8, 0.8, 1);
  root.add(shadow);

  const persona = PERSONA[id] || PERSONA['yellow-dwarf'];
  const size = star(id)?.size || 1;
  const phase = Math.random() * 10;
  let nextBlink = 1 + Math.random() * 4;
  let blink = 0;
  let hopV = 0;
  let gag = null;
  let nextGag = 1.5 + Math.random() * 4;
  let reaction = null;

  root.userData = {
    id,
    size,
    critter: true,
    shadow,
    hop(power = 1) {
      hopV = Math.max(hopV, power);
    },
    react(name) {
      if (REACTIONS[name]) reaction = { name, t: 0, dur: REACTIONS[name] };
    },
    // pull a gag right now (a Stink Star lands in a patch and, naturally, lets one go)
    gagNow(name) {
      if (!reaction && (!gag || gag.name !== name)) gag = { name, t: 0, dur: GAG_TIME[name] || 0.8 };
    },
    update(time, dt = 0.016) {
      const s = time + phase;
      // the idle: bob, sway, breathe
      let y = Math.sin(s * persona.bounce) * 0.06;
      let rz = Math.sin(s * 0.9 * persona.sway) * 0.08;
      let ry = Math.sin(s * 0.6) * 0.12;
      let sy = 1 + Math.sin(s * persona.bounce * 1.1) * persona.breathe;
      if (id === 'pulsar') {
        // bounces to the beat
        const beat = Math.max(0, Math.sin(s * 3.7));
        y += beat * beat * 0.16;
        sy += beat * beat * 0.1;
      }
      let sx = 1 / Math.sqrt(sy);
      let eyeX = Math.sin(s * 0.5) * 0.03;
      let mouthY = 1;
      let eyeSquint = 1;

      // a hop after landing
      hopV = Math.max(0, hopV - dt * 2.4);
      if (hopV > 0) {
        const k = 1 - hopV;
        y += Math.sin(k * Math.PI) * hopV * 0.9;
        sy += (k < 0.15 ? -0.2 * (1 - k / 0.15) : 0) + Math.sin(k * Math.PI) * 0.12 * hopV;
      }

      // a gag every few seconds
      nextGag -= dt;
      if (!gag && !reaction && nextGag <= 0) {
        const name = persona.gags[Math.floor(Math.random() * persona.gags.length)];
        gag = { name, t: 0, dur: GAG_TIME[name] || 0.8 };
        nextGag = 3 + Math.random() * 5;
      }
      if (gag) {
        gag.t += dt;
        const k = Math.min(1, gag.t / gag.dur);
        const up = Math.sin(k * Math.PI);
        switch (gag.name) {
          case 'hop':
            y += up * 0.7;
            sy += k < 0.12 ? -0.2 : up * 0.1;
            break;
          case 'spin':
            ry += k * Math.PI * 2;
            y += up * 0.45;
            break;
          case 'wiggle':
            rz += Math.sin(k * 28) * 0.22 * (1 - k);
            break;
          case 'look':
            eyeX += Math.sin(k * Math.PI * 2) * 0.09;
            ry += Math.sin(k * Math.PI * 2) * 0.35;
            break;
          case 'stomp':
            y += k < 0.3 ? up * 0.35 : 0;
            sy += k > 0.3 && k < 0.45 ? -0.22 : 0;
            rz += Math.sin(k * 40) * 0.07 * (k > 0.3 ? 1 : 0);
            break;
          case 'nod':
            rz += Math.sin(k * Math.PI * 2) * 0.2;
            sy += up * 0.06;
            break;
          case 'flex':
            sx += up * 0.18;
            sy += up * 0.12;
            y += up * 0.12;
            break;
          case 'fart':
            // crouch and strain... then PFFFT, and up it goes with a look of great relief
            if (k < 0.3) {
              sy -= 0.2 * (k / 0.3);
              sx += 0.14 * (k / 0.3);
              rz += Math.sin(k * 70) * 0.06;
              eyeSquint = 0.7;
            } else {
              if (!gag.fired) {
                gag.fired = true;
                root.userData.onFart?.(root);
              }
              const kk = (k - 0.3) / 0.7;
              y += Math.sin(kk * Math.PI) * 0.5;
              sy += Math.sin(kk * Math.PI) * 0.14;
              rz += Math.sin(kk * 14) * 0.12 * (1 - kk);
              mouthY = 1.6;
              eyeSquint = 0.35;
            }
            break;
          case 'shiver':
            rz += Math.sin(k * 60) * 0.06 * up;
            sx += Math.sin(k * 50) * 0.03 * up;
            break;
          default:
            break;
        }
        if (k >= 1) gag = null;
      }

      // reactions beat everything else
      if (reaction) {
        reaction.t += dt;
        const k = Math.min(1, reaction.t / reaction.dur);
        const up = Math.sin(k * Math.PI);
        if (reaction.name === 'cheer') {
          y += Math.abs(Math.sin(k * Math.PI * 2)) * 0.9 * (1 - k * 0.3);
          ry += k * Math.PI * 2;
          sy += Math.abs(Math.sin(k * Math.PI * 2)) * 0.14;
          eyeSquint = 0.22;
          mouthY = 1.9;
        } else if (reaction.name === 'sad') {
          sy -= up * 0.28;
          sx += up * 0.14;
          rz += Math.sin(k * 8) * 0.06 * up + up * 0.16;
          y -= up * 0.1;
          mouthY = -1;
          eyeSquint = 0.6;
        } else if (reaction.name === 'wow') {
          sy += up * 0.34;
          sx -= up * 0.1;
          y += up * 0.25;
          mouthY = 1.7;
        } else if (reaction.name === 'shake') {
          rz += Math.sin(k * 50) * 0.18 * (1 - k);
        }
        if (k >= 1) reaction = null;
      }

      inner.position.y = y;
      inner.rotation.z = rz;
      inner.rotation.y = ry;
      inner.scale.set(sx, sy, sx);
      // the shadow stays on the ground and shrinks as the buddy jumps
      shadow.scale.setScalar(Math.max(0.3, 0.8 - Math.max(0, y) * 0.35));
      if (eyes) {
        nextBlink -= dt;
        if (nextBlink < 0) {
          nextBlink = 2 + Math.random() * 4;
          blink = 0.13;
        }
        blink = Math.max(0, blink - dt);
        eyes.scale.y = blink > 0 ? 0.1 : eyeSquint;
        eyes.position.x = eyeX;
      }
      if (mouth) mouth.scale.set(mouthY > 1 ? 1.2 : 1, mouthY, 1);
      if (costume && move) {
        costume.position.set(...move.pivot);
        costume.rotation.set(0, 0, 0);
        costume.scale.set(1, 1, 1);
        move.fn(costume, s);
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
    p.add(cyl(0.34, 0.34, 0.1, 28), '#ffb21a');
    p.add(cyl(0.27, 0.27, 0.11, 28), '#ffd95e');
    const s = new THREE.ExtrudeGeometry(starShape(0.17, 0.08, 0.2), { depth: 0.03, bevelEnabled: false, curveSegments: 4 });
    p.add(s.clone(), '#fff2b0', { p: [0, 0.06, 0], r: [-Math.PI / 2, 0, 0] });
    p.add(s, '#fff2b0', { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0] });
    COIN = p.build();
  }
  const g = new THREE.Group();
  g.add(ink(new THREE.Mesh(COIN, mats().body), 2.2));
  return g;
}

let CARD = null;
export function makeCardBack() {
  if (!CARD) {
    const p = new Parts();
    p.add(box(0.56, 0.05, 0.78), '#7b5cff');
    p.add(new THREE.ExtrudeGeometry(starShape(0.18, 0.09, 0.25), { depth: 0.02, bevelEnabled: false, curveSegments: 4 }), '#ffd93d', { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0] });
    CARD = p.build();
  }
  const g = new THREE.Group();
  g.add(ink(new THREE.Mesh(CARD, mats().body), 2.4));
  return g;
}
