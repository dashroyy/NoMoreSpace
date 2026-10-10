// 🦠 The Outbreak's rooms. While a ship plays that script, the station is a
// research lab that has gone wrong (the space-station props are hidden, see
// ship.setTheme): specimen tanks glowing in the Containment Hub, a Specimen
// Gallery of things in jars, a Genome Lab with a spinning DNA helix and a
// centrifuge, an Alarm Center with sweeping red beacons, a Sick Bay of
// plastic-wrapped isolation beds, a Test Kitchen with a pot of green goo, an
// Incinerator, a Ventilation Plant with great fans, a Mould Garden of giant
// glowing mushrooms, a Decon Chamber with shower heads, Quarantine Cells and a
// Cold Storage full of cryo pods. Hazard-tape runs along every north wall, and
// spores drift through the air.
//
// Everything is made of simple shapes and canvas patterns (no image files). Pieces
// that never move are merged into a few meshes per material; the helix, centrifuge,
// beacons, fans, bubbles and mushrooms are animated. Purely for looks.
import * as THREE from 'three';
import { ROOMS, CORRIDORS, roomOutline, chamferOf } from './layout.js';
import { M, T, add, cyl, box, ball, tor, mergeStatic } from './carnival-rooms.js';

const WHITE = 0xf2f7f5;
const MINT = 0xbfeee0;
const HAZ = 0xffd23f;
const BLACK = 0x1a1a22;
const TOXIC = 0x7dff3a;
const TEAL = 0x38d6c8;
const PURPLE = 0x9a5bff;
const RED = 0xd7263d;
const STEEL = 0x9aa7b5;
const ICE = 0xa9d0e8;
const SPORE_COLORS = [0x9bff4a, 0x6bffd8, 0xd18bff];

// the point light in each room takes on a lab colour
export const OUTBREAK_LIGHTS = {
  bridge: 0x9be36b, observation: 0x7dffd8, navigation: 0x6bd8ff, comms: 0xff6b6b, medbay: 0x9bffb8, galley: 0xffe29b,
  reactor: 0xff9a3a, engine: 0x8fd0ff, hydroponics: 0xb8ff3a, airlock: 0xffe14f, quarters: 0xb99bff, cargo: 0x9be8ff,
};

const FLOORS = {
  observation: ['checker', WHITE, 0x9fd8c8], navigation: ['checker', 0x1c3a4a, 0x2a5a6a], comms: ['diag', 0x2a2a35, HAZ], medbay: ['checker', WHITE, 0xcfe8f0],
  galley: ['checker', WHITE, 0xe0c8a0], reactor: ['diag', 0x2a2a30, 0xff9a3a], engine: ['stripes', 0x3a4650, 0x56646f], hydroponics: ['dots', 0x1f4a2a, 0x6bd83a],
  airlock: ['diag', HAZ, BLACK], quarters: ['checker', 0x555e6a, 0x6a7480], cargo: ['checker', 0xcfe9ff, 0xa9d0e8], bridge: null,
};

// the biohazard symbol, drawn as three open rings round a hub
function biohazardMaterial() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffd23f';
  g.fillStyle = '#ffd23f';
  g.lineCap = 'butt';
  g.lineWidth = 46;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(256 + Math.cos(a) * 92, 256 + Math.sin(a) * 92, 92, a - 2.35, a + 2.35);
    g.stroke();
    g.beginPath();
    g.arc(256 + Math.cos(a) * 168, 256 + Math.sin(a) * 168, 20, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 16;
  g.beginPath();
  g.arc(256, 256, 34, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 10;
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}

const glass = (color = 0xbfeee0, o = 0.22) => M(color, { o, r: 0.05 });
const goo = (color = TOXIC) => M(color, { e: 1.1, o: 0.8, r: 0.3 });

export class OutbreakRooms {
  constructor(ship, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.active = false;
    this.lowFx = lowFx;
    this.anims = [];
    const still = new THREE.Group();
    this.floors(still);
    this.tape();
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
      this.bollards(R, still);
      const dress = this[`room_${room.id}`];
      if (dress) dress.call(this, R);
    }
    this.spores();
    this.group.add(mergeStatic(still));
    still.clear();
  }

  // ---------- floors, corridor runners, hazard tape, bollards, spores ----------
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
    // the hub: a dark floor with a great biohazard symbol round the table
    const hub = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), biohazardMaterial());
    hub.rotation.x = -Math.PI / 2;
    hub.position.set(0, 0.014, 0);
    this.group.add(hub);
    for (const [x0, z0, x1, z1] of CORRIDORS) {
      const mat = T('checker', 0x3a4650, 0x2c363f, x1 - x0, z1 - z0, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0.009, (z0 + z1) / 2);
      parent.add(mesh);
    }
  }

  // yellow and black hazard tape along each room's north wall, with amber lamps at the ends
  tape() {
    for (const room of ROOMS) {
      const [x0, z0, x1] = room.rect;
      const ch = chamferOf(room.rect);
      const len = x1 - x0 - ch * 2 - 0.6;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.06), T('diag', HAZ, BLACK, len / 1.2, 0.4));
      strip.position.set((x0 + x1) / 2, 1.9, z0 + 0.62);
      this.group.add(strip);
      for (const s of [-1, 1]) {
        const lamp = new THREE.Mesh(ball(0.14, 8), M(0xffb02e, { e: 1.6 }));
        lamp.position.set((x0 + x1) / 2 + s * (len / 2 + 0.1), 2.15, z0 + 0.62);
        this.group.add(lamp);
      }
    }
  }

  bollards(R, parent) {
    const [x0, z0, x1] = R.room.rect;
    const ch = chamferOf(R.room.rect);
    const g = new THREE.Group();
    for (const [x, z] of [[x0 + 0.2, z0 + ch], [x1 - 0.2, z0 + ch]]) {
      add(g, cyl(0.2, 0.22, 1.3, 12), T('diag', HAZ, BLACK, 3, 3), x, 0.65, z);
      add(g, ball(0.17, 10), M(TOXIC, { e: 1.5 }), x, 1.4, z);
    }
    parent.add(g);
  }

  // drifting glowing spores in the air
  spores() {
    const n = this.lowFx ? 50 : 110;
    this.sporePos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.sporeData = [];
    for (let i = 0; i < n; i++) {
      const room = ROOMS[i % ROOMS.length];
      const [x0, z0, x1, z1] = room.rect;
      this.sporeData.push({ x: x0 + Math.random() * (x1 - x0), y: Math.random() * 3.5, z: z0 + Math.random() * (z1 - z0), speed: 0.12 + Math.random() * 0.25, sway: Math.random() * 6 });
      const c = new THREE.Color(SPORE_COLORS[i % 3]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sporePos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sporePoints = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sporePoints.frustumCulled = false;
    this.group.add(this.sporePoints);
  }

  // a glass tank with glowing liquid and rising bubbles
  tank(R, x, z, { h = 3, r = 0.9, color = TOXIC, blob = true } = {}) {
    const s = R.at(x, 0, z);
    add(s, cyl(r + 0.12, r + 0.18, 0.3, 18), M(0x3a4650, { r: 0.4 }), 0, 0.15, 0);
    add(s, cyl(r, r, h, 18), glass(color, 0.28), 0, 0.3 + h / 2, 0);
    add(s, cyl(r * 0.96, r * 0.96, h * 0.85, 18), goo(color), 0, 0.3 + h * 0.425 + 0.05, 0);
    add(s, cyl(r + 0.12, r + 0.12, 0.3, 18), M(0x3a4650, { r: 0.4 }), 0, 0.45 + h, 0);
    const live = R.at(x, 0.3, z, 0, true);
    const bubbles = Array.from({ length: this.lowFx ? 4 : 8 }, (_, i) => {
      const b = add(live, ball(0.07 + (i % 3) * 0.02, 6), M(0xe6ffd0, { e: 0.8, o: 0.8 }), 0, 0, 0);
      return { b, phase: i * 0.9, ang: i * 1.9 };
    });
    let blobMesh = null;
    if (blob) blobMesh = add(live, ball(r * 0.4, 12), M(PURPLE, { e: 0.9, o: 0.9 }), 0, h * 0.45, 0, null, [1, 1.3, 1]);
    this.anims.push((t) => {
      bubbles.forEach(({ b, phase, ang }) => {
        const u = ((t * 0.35 + phase) % 3) / 3;
        b.position.set(Math.cos(ang) * r * 0.6 * (1 - u * 0.3), u * h * 0.85, Math.sin(ang) * r * 0.6 * (1 - u * 0.3));
      });
      if (blobMesh) {
        blobMesh.position.y = h * 0.45 + Math.sin(t * 0.7 + x) * 0.25;
        blobMesh.scale.set(1 + Math.sin(t * 1.4) * 0.08, 1.3 + Math.sin(t * 1.1) * 0.1, 1);
      }
    });
  }

  mushroom(parent, x, z, h, capR, color = 0x7dff3a) {
    add(parent, cyl(capR * 0.22, capR * 0.3, h, 10), M(0xe8f3d0, { e: 0.15, r: 0.7 }), x, h / 2, z);
    add(parent, new THREE.SphereGeometry(capR, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(color, { e: 0.7, r: 0.5 }), x, h, z, null, [1, 0.65, 1]);
    add(parent, cyl(capR * 0.98, capR * 0.2, 0.06, 16), M(0xffe9a0, { e: 0.4 }), x, h - 0.02, z);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      add(parent, ball(capR * 0.1, 6), M(0xf2ffd8, { e: 0.9 }), x + Math.cos(a) * capR * 0.5, h + capR * 0.38, z + Math.sin(a) * capR * 0.5);
    }
  }

  // ---------- 🧪 Bridge → The Containment Hub ----------
  room_bridge(R) {
    this.tank(R, -7.5, -7.5, { h: 3.2, r: 0.9, color: TOXIC });
    this.tank(R, 7.5, -7.5, { h: 3.2, r: 0.9, color: 0x6bffd8 });
    const s = R.at(0, 0, -9);
    add(s, box(5, 1.1, 0.8), M(0x3a4650, { r: 0.4 }), 0, 0.55, 0);
    add(s, box(4.6, 0.06, 0.6), M(TOXIC, { e: 1.2 }), 0, 1.13, 0, [-0.4, 0, 0]);
    for (const x of [-3.5, 3.5]) {
      add(s, cyl(0.45, 0.45, 0.9, 14), T('diag', HAZ, BLACK, 4, 2), x, 0.45, 0.6);
    }
  }

  // ---------- 🔭 Observation Deck → The Specimen Gallery ----------
  room_observation(R) {
    const s = R.at(0, 0, 0);
    // the giant dome case with a glowing mushroom in it
    add(s, cyl(2.4, 2.5, 0.5, 24), M(0x3a4650, { r: 0.4 }), -4.5, 0.25, -3);
    this.mushroom(s, -4.5, -3, 2.0, 1.1, 0x9aff4a);
    add(s, new THREE.SphereGeometry(2.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass(TEAL, 0.18), -4.5, 0.5, -3);
    // a row of glass cases on pedestals, each with something in it
    [[-6, TOXIC], [-2.5, PURPLE], [1, 0xffe14f], [4.5, 0xff6b9a]].forEach(([x, c], i) => {
      add(s, box(1.6, 0.9, 1.2), M(0x3a4650, { r: 0.4 }), x, 0.45, 3.6);
      add(s, box(1.5, 1.4, 1.1), glass(TEAL, 0.2), x, 1.6, 3.6);
      add(s, ball(0.4, 12), goo(c), x, 1.4, 3.6, null, [1, 0.8 + (i % 2) * 0.4, 1]);
      add(s, box(1.55, 0.05, 1.15), M(HAZ, { e: 0.5 }), x, 2.32, 3.6);
    });
    const jelly = R.at(-1, 2.6, -3, 0, true);
    add(jelly, ball(0.45, 12), M(0xd18bff, { e: 0.9, o: 0.7 }), 0, 0, 0, null, [1, 0.7, 1]);
    for (let k = 0; k < 6; k++) add(jelly, cyl(0.02, 0.02, 0.9, 4), M(0xd18bff, { e: 0.8, o: 0.6 }), Math.cos(k) * 0.28, -0.5, Math.sin(k) * 0.28);
    this.anims.push((t) => { jelly.position.y = 2.6 + Math.sin(t * 0.8) * 0.3; jelly.rotation.y = t * 0.3; });
  }

  // ---------- 🧬 Navigation → The Genome Lab ----------
  room_navigation(R) {
    const helix = R.at(0, 0, 3.4, 0, true);
    add(helix, cyl(0.7, 0.8, 0.25, 16), M(0x3a4650, { r: 0.4 }), 0, 0.12, 0);
    const spin = new THREE.Group();
    helix.add(spin);
    const A = M(TEAL, { e: 1.2 });
    const B = M(0xff6bd8, { e: 1.2 });
    for (let i = 0; i < 26; i++) {
      const y = 0.5 + i * 0.16;
      const a = i * 0.5;
      add(spin, ball(0.09, 7), A, Math.cos(a) * 0.55, y, Math.sin(a) * 0.55);
      add(spin, ball(0.09, 7), B, -Math.cos(a) * 0.55, y, -Math.sin(a) * 0.55);
      if (i % 2 === 0) add(spin, cyl(0.015, 0.015, 1.1, 4), M(0xe6ffd0, { e: 0.6 }), 0, y, 0, [0, 0, Math.PI / 2]).rotation.y = -a;
    }
    this.anims.push((t, dt) => { spin.rotation.y += dt * 0.7; });
    const s = R.at(0, 0, 0);
    // lab benches with microscopes
    for (const x of [-6, 6]) {
      add(s, box(2.8, 0.9, 1.1), T('checker', WHITE, 0xcfe8f0, 3, 1), x, 0.45, -2.6);
      add(s, box(2.9, 0.06, 1.2), M(STEEL, { r: 0.3 }), x, 0.93, -2.6);
      add(s, cyl(0.05, 0.08, 0.5, 8), M(0x222a35), x - 0.5, 1.2, -2.6);
      add(s, cyl(0.07, 0.07, 0.35, 8), M(0x222a35), x - 0.4, 1.5, -2.6, [0.5, 0, 0]);
      for (let k = 0; k < 3; k++) add(s, cyl(0.16, 0.16, 0.04, 10), glass(TOXIC, 0.6), x + 0.2 + k * 0.4, 0.98, -2.6);
    }
    // a centrifuge
    add(s, cyl(0.9, 1.0, 0.8, 18), M(0xdfe6ee, { r: 0.35 }), 6, 0.4, 3.6);
    const rotor = R.at(6, 0.85, 3.6, 0, true);
    add(rotor, cyl(0.7, 0.7, 0.08, 18), M(0x555e6a, { r: 0.3 }), 0, 0, 0);
    for (let k = 0; k < 6; k++) add(rotor, cyl(0.07, 0.07, 0.3, 6), glass(TEAL, 0.6), Math.cos(k * 1.05) * 0.5, 0.15, Math.sin(k * 1.05) * 0.5);
    this.anims.push((t, dt) => { rotor.rotation.y += dt * 8; });
  }

  // ---------- 🚨 Comms → The Alarm Center ----------
  room_comms(R) {
    const beacons = [];
    for (const x of [-6.5, 6.5]) {
      const s = R.at(x, 0, -3.8);
      add(s, cyl(0.1, 0.12, 2.6, 8), M(0x555e6a, { r: 0.4 }), 0, 1.3, 0);
      const live = R.at(x, 2.7, -3.8, 0, true);
      add(live, new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(RED, { e: 1.8 }), 0, 0, 0);
      const wedge = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      wedge.rotation.z = Math.PI / 2;
      wedge.position.x = 2.5;
      const pivot = new THREE.Group();
      pivot.add(wedge);
      live.add(pivot);
      beacons.push(pivot);
    }
    this.anims.push((t, dt) => beacons.forEach((b, i) => { b.rotation.y += dt * (3 + i); }));
    const s = R.at(0, 0, 0);
    // a siren tower and a control desk
    add(s, cyl(0.35, 0.45, 2.2, 10), M(0x3a4650, { r: 0.4 }), -3.5, 1.1, 2);
    for (let k = 0; k < 4; k++) add(s, new THREE.ConeGeometry(0.28, 0.6, 10, 1, true), M(0xcfd8dc, { metalness: 0.5, r: 0.3 }), -3.5 + Math.cos(k * 1.57) * 0.5, 2.5, 2 + Math.sin(k * 1.57) * 0.5, [Math.PI / 2, 0, k * 1.57]);
    add(s, box(5, 0.9, 1.2), M(0x3a4650, { r: 0.4 }), 1.5, 0.45, 3.4);
    add(s, box(4.6, 0.05, 0.8), M(0x151b24), 1.5, 0.95, 3.4, [-0.3, 0, 0]);
    for (let i = 0; i < 8; i++) add(s, ball(0.06, 6), M([RED, TOXIC, HAZ, TEAL][i % 4], { e: 1.5 }), -0.5 + i * 0.5, 1.0, 3.3);
  }

  // ---------- 🩺 Medbay → The Sick Bay ----------
  room_medbay(R) {
    const s = R.at(0, 0, 0);
    // isolation beds wrapped in plastic sheeting
    for (const x of [-5.2, -1.8, 1.6]) {
      add(s, box(2.2, 0.5, 1.1), M(WHITE), x, 0.4, -3.6);
      add(s, box(2.1, 0.12, 1.0), M(0xa9d8ee), x, 0.72, -3.6);
      add(s, box(2.5, 1.6, 1.5), glass(0xbfe8ff, 0.2), x, 1.0, -3.6);
      for (const [dx, dz] of [[-1.25, -0.75], [1.25, -0.75], [-1.25, 0.75], [1.25, 0.75]]) add(s, cyl(0.04, 0.04, 1.8, 5), T('diag', HAZ, BLACK, 1, 3), x + dx, 0.9, -3.6 + dz);
      add(s, ball(0.1, 8), M(RED, { e: 1.6 }), x, 1.95, -3.6);
    }
    // a heart monitor that never quite settles, and a drip stand
    add(s, cyl(0.04, 0.05, 1.4, 6), M(STEEL), 3.8, 0.7, -3.4);
    add(s, box(0.9, 0.6, 0.1), M(0x151b24), 3.8, 1.55, -3.4);
    add(s, box(0.8, 0.04, 0.02), M(TOXIC, { e: 1.6 }), 3.8, 1.55, -3.34);
    add(s, ball(0.18, 10), M(0xe8f3ff, { o: 0.5 }), 5, 2.0, -3.2, null, [0.7, 1, 0.5]);
    add(s, cyl(0.02, 0.02, 2.0, 5), M(STEEL), 5, 1.0, -3.2);
    // a cure fridge with glowing vials
    add(s, box(1.4, 2.4, 0.9), M(0xdfe6ee, { r: 0.3 }), 6.2, 1.2, 1.5);
    add(s, box(1.2, 2.1, 0.06), glass(TEAL, 0.3), 6.2, 1.2, 1.98);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) add(s, cyl(0.07, 0.07, 0.3, 6), goo(r % 2 ? TOXIC : 0x6bffd8), 5.85 + c * 0.35, 0.5 + r * 0.45, 1.9);
  }

  // ---------- 🍲 Galley → The Test Kitchen ----------
  room_galley(R) {
    const s = R.at(0, 0, 0);
    for (const [x, z] of [[-3.6, 2.2], [0.4, 2.2]]) {
      add(s, box(3.2, 0.95, 1.2), M(STEEL, { r: 0.3 }), x, 0.48, z);
      for (let k = 0; k < 3; k++) add(s, cyl(0.2, 0.2, 0.05, 10), glass(k % 2 ? TOXIC : 0xff9a3a, 0.7), x - 0.9 + k * 0.9, 1.0, z);
    }
    // the pot of green goo
    add(s, cyl(1.1, 0.95, 1.2, 20), M(0x555e6a, { metalness: 0.7, r: 0.3 }), 4.8, 0.6, -3);
    add(s, cyl(1.0, 1.0, 0.05, 20), goo(TOXIC), 4.8, 1.18, -3);
    add(s, tor(1.1, 0.07, 20), M(STEEL), 4.8, 1.2, -3, [Math.PI / 2, 0, 0]);
    const pot = R.at(4.8, 1.2, -3, 0, true);
    const blobs = Array.from({ length: 5 }, (_, i) => ({ b: add(pot, ball(0.12 + (i % 2) * 0.05, 8), goo(TOXIC), 0, 0, 0), a: i * 1.3, ph: i * 0.8 }));
    this.anims.push((t) => blobs.forEach(({ b, a, ph }) => {
      const u = ((t * 0.5 + ph) % 2) / 2;
      b.position.set(Math.cos(a) * 0.55, Math.sin(u * Math.PI) * 0.5, Math.sin(a) * 0.55);
      b.scale.setScalar(0.4 + Math.sin(u * Math.PI) * 0.8);
    }));
    // a rack of sample jars along the north wall
    add(s, box(6, 0.1, 0.5), M(0x555e6a), -3, 1.6, -5.6);
    for (let i = 0; i < 9; i++) add(s, cyl(0.17, 0.17, 0.4, 8), goo(i % 3 === 0 ? TOXIC : i % 3 === 1 ? PURPLE : 0xffb02e), -5.4 + i * 0.6, 1.85, -5.6);
  }

  // ---------- 🔥 Reactor → The Incinerator ----------
  room_reactor(R) {
    const s = R.at(0, 0, -3.8);
    add(s, box(6.4, 2.8, 2.4), M(0x3a3a42, { r: 0.5 }), 0, 1.4, 0);
    add(s, box(1.8, 1.4, 0.15), M(0xff7a1a, { e: 1.6 }), 0, 1.0, 1.25);
    add(s, box(2.0, 1.6, 0.1), M(0x15151a), 0, 1.0, 1.2);
    add(s, cyl(0.5, 0.6, 3.2, 14), M(0x2a2a32), 2.2, 4.0, -0.4);
    add(s, tor(1.2, 0.05, 20), T('diag', HAZ, BLACK, 20, 1), 0, 0.15, 3, [Math.PI / 2, 0, 0]);
    // black waste bags with biohazard marks, ready for the furnace
    for (const [x, z] of [[-5, 2.8], [-4.2, 3.6], [-3.5, 2.6], [4.4, 3.0], [5.2, 3.8]]) {
      add(s, ball(0.45, 10), M(0x15151a, { r: 0.4 }), x, 0.4, z, null, [1.1, 0.9, 1]);
      add(s, ball(0.1, 6), M(HAZ, { e: 0.9 }), x, 0.55, z + 0.4);
    }
    const flame = R.at(0, 0.5, -2.45, 0, true);
    const tongues = Array.from({ length: 5 }, (_, i) => add(flame, new THREE.ConeGeometry(0.22, 0.8, 6), M(i % 2 ? 0xff7a1a : 0xffd23f, { e: 1.8, o: 0.85 }), -0.7 + i * 0.35, 0.5, 0));
    this.anims.push((t) => tongues.forEach((c, i) => { c.scale.y = 0.7 + Math.sin(t * 9 + i * 2) * 0.35; c.position.y = 0.4 + c.scale.y * 0.3; }));
  }

  // ---------- 🌀 Engine Room → The Ventilation Plant ----------
  room_engine(R) {
    const fans = [];
    for (const x of [-5.5, 5.5]) {
      const s = R.at(x, 0, -6.7);
      add(s, tor(1.7, 0.2, 24), M(0x555e6a, { metalness: 0.7, r: 0.3 }), 0, 2.2, 0.1);
      add(s, new THREE.CircleGeometry(1.6, 24), M(0x0f141a), 0, 2.2, 0.05);
      const live = R.at(x, 2.2, -6.55, 0, true);
      const blades = new THREE.Group();
      live.add(blades);
      for (let k = 0; k < 6; k++) add(blades, box(0.4, 1.4, 0.04), M(0xaab4c0, { metalness: 0.6, r: 0.3 }), 0, 0.75, 0, [0.3, 0, 0]).rotation.z = (k / 6) * Math.PI * 2;
      add(blades, cyl(0.25, 0.25, 0.15, 10), M(0x333a45), 0, 0, 0, [Math.PI / 2, 0, 0]);
      fans.push(blades);
    }
    this.anims.push((t, dt) => fans.forEach((f, i) => { f.rotation.z += dt * (5 + i); }));
    const s = R.at(0, 0, 0);
    // banks of filters and a long duct
    for (const x of [-3.5, -1.2, 1.1, 3.4]) {
      add(s, box(1.8, 1.8, 0.9), M(0x3a4650, { r: 0.4 }), x, 0.9, 3.4);
      for (let r = 0; r < 4; r++) add(s, box(1.5, 0.08, 0.05), M(TOXIC, { e: 1 }), x, 0.3 + r * 0.4, 2.93);
    }
    add(s, cyl(0.5, 0.5, 18, 12), M(0x6a7480, { metalness: 0.6, r: 0.4 }), 0, 2.7, 5.6, [0, 0, Math.PI / 2]);
  }

  // ---------- 🍄 Hydroponics → The Mould Garden ----------
  room_hydroponics(R) {
    const s = R.at(0, 0, 0);
    const live = [];
    [[-6.2, -3, 3.0, 1.4], [-3.2, -4.2, 2.0, 1.0], [-0.5, -3.4, 3.4, 1.6], [3, -4, 1.6, 0.8], [5.8, -2.6, 2.6, 1.2], [-5, 3.2, 1.2, 0.7], [-1.5, 4, 1.7, 0.8], [6, 3.6, 1.4, 0.7]].forEach(([x, z, h, r], i) => {
      this.mushroom(s, x, z, h, r, [0x7dff3a, 0x6bffd8, 0xd18bff][i % 3]);
      live.push([x, z, h, r]);
    });
    // glowing fungus on the beds and drifting puffballs
    for (const x of [-4, 0, 4]) {
      add(s, box(2.6, 0.45, 1.0), M(0x2a1f14), x, 0.22, 1.2);
      for (let k = 0; k < 5; k++) add(s, ball(0.13, 8), goo([TOXIC, 0x6bffd8, PURPLE][k % 3]), x - 0.9 + k * 0.45, 0.55, 1.2);
    }
    const pulse = R.at(0, 0, 0, 0, true);
    const lamps = live.slice(0, 4).map(([x, z, h]) => add(pulse, ball(0.35, 8), M(0xd9ff9a, { e: 1.2, o: 0.35 }), x, h + 0.9, z));
    this.anims.push((t) => lamps.forEach((l, i) => l.scale.setScalar(1 + Math.sin(t * 1.5 + i * 2) * 0.35)));
  }

  // ---------- 🚿 Airlock → The Decon Chamber ----------
  room_airlock(R) {
    const s = R.at(0, 0, 0);
    // a round bulkhead door with a wheel, over the old airlock door
    add(s, box(0.2, 2.5, 6.6), M(0x3a4650, { metalness: 0.5, r: 0.4 }), -3.5, 1.25, 0);
    add(s, cyl(1.5, 1.5, 0.15, 28), M(0x9aa7b5, { metalness: 0.7, r: 0.3 }), -3.35, 1.4, 0, [0, 0, Math.PI / 2]);
    add(s, tor(1.5, 0.12, 28), T('diag', HAZ, BLACK, 20, 1), -3.35, 1.4, 0, [0, Math.PI / 2, 0]);
    add(s, tor(0.7, 0.06, 18), M(0x555e6a), -3.25, 1.4, 0, [0, Math.PI / 2, 0]);
    for (let k = 0; k < 4; k++) add(s, box(0.06, 1.4, 0.08), M(0x555e6a), -3.25, 1.4, 0, [(k * Math.PI) / 4, 0, 0]);
    // shower heads over the floor, with a pale spray
    const spray = [];
    for (const [x, z] of [[0.5, -2.8], [0.5, 0], [0.5, 2.8]]) {
      add(s, cyl(0.04, 0.04, 1.2, 5), M(STEEL), x, 2.2, z);
      add(s, cyl(0.28, 0.08, 0.14, 12), M(STEEL), x, 1.55, z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.5, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      cone.position.set(R.cx + x, 0.8, R.cz + z);
      cone.rotation.x = Math.PI;
      this.group.add(cone);
      spray.push(cone);
    }
    this.anims.push((t) => spray.forEach((c, i) => { c.material.opacity = 0.1 + (Math.sin(t * 6 + i * 2) * 0.5 + 0.5) * 0.12; }));
    const lamp = R.at(-3.0, 2.7, 0, 0, true);
    const bulbMat = M(0xffb02e, { e: 2 });
    add(lamp, ball(0.2, 10), bulbMat, 0, 0, 0);
    this.anims.push((t) => { bulbMat.emissiveIntensity = Math.sin(t * 5) > 0 ? 2.2 : 0.2; });
  }

  // ---------- 🔒 Crew Quarters → The Quarantine Cells ----------
  room_quarters(R) {
    const s = R.at(0, 0, 0);
    [-3.6, -0.2].forEach((x, i) => {
      add(s, box(2.8, 0.45, 1.6), M(0x555e6a), x, 0.25, -3.8);
      add(s, box(2.5, 0.12, 1.3), M(i ? 0x9a7ad8 : 0x7ad0c8), x, 0.55, -3.8);
      add(s, box(2.9, 2.0, 0.08), glass(0xbfe8ff, 0.25), x, 1.1, -2.95);
      add(s, box(2.9, 0.1, 0.12), T('diag', HAZ, BLACK, 6, 0.3), x, 2.15, -2.95);
      add(s, box(2.9, 0.1, 0.12), T('diag', HAZ, BLACK, 6, 0.3), x, 0.1, -2.95);
      add(s, ball(0.12, 8), M(RED, { e: 1.8 }), x + 1.2, 2.3, -2.9);
    });
    // a guard desk with a stack of forms
    add(s, box(2.4, 0.9, 1.0), M(0x3a4650, { r: 0.4 }), 2.9, 0.45, 3);
    add(s, box(0.7, 0.2, 0.5), M(0xf2ead0), 2.5, 1.0, 3);
    add(s, cyl(0.1, 0.1, 0.18, 8), M(RED), 3.4, 1.0, 3);
    // a laundry cart of spare hazmat suits
    add(s, box(1.2, 0.8, 0.9), M(0x6a7480), -4.4, 0.4, 3.4);
    add(s, ball(0.5, 10), M(HAZ, { r: 0.8 }), -4.4, 0.95, 3.4, null, [1.2, 0.6, 1]);
  }

  // ---------- ❄️ Cargo → The Cold Storage ----------
  room_cargo(R) {
    const s = R.at(0, 0, 0);
    // cryo pods standing in a row, each with a shape asleep in the frost
    [-8, -5.6, -3.2, -0.8].forEach((x, i) => {
      add(s, cyl(0.7, 0.8, 0.3, 14), M(0x3a4650, { r: 0.4 }), x, 0.15, -3.4);
      add(s, new THREE.CapsuleGeometry(0.6, 1.6, 4, 14), glass(ICE, 0.32), x, 1.3, -3.4);
      add(s, new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), M(PALETTE_SLEEP[i % 3], { e: 0.4, o: 0.8 }), x, 1.3, -3.4);
      add(s, ball(0.09, 6), M(TEAL, { e: 1.8 }), x, 2.6, -3.4);
    });
    // frost-white freezer units and yellow drums
    for (const x of [3, 5.2, 7.4]) {
      add(s, box(1.8, 2.5, 1.2), M(0xe3eef4, { r: 0.3 }), x, 1.25, -3.8);
      add(s, box(1.5, 2.1, 0.06), glass(TEAL, 0.35), x, 1.3, -3.17);
      add(s, box(1.2, 0.05, 0.06), M(0x9be8ff, { e: 1.4 }), x, 2.35, -3.12);
    }
    for (const [x, z] of [[-8, 2.4], [-7, 3.2], [-6.1, 2.4], [7, 2.8], [6.2, 3.6]]) {
      add(s, cyl(0.45, 0.45, 1.0, 12), M(HAZ, { r: 0.5 }), x, 0.5, z);
      add(s, cyl(0.46, 0.46, 0.25, 12), M(BLACK), x, 0.5, z);
    }
    // icy crates
    for (const [x, z, h] of [[-3.6, 3, 0.9], [-2.4, 3.4, 0.7], [-3, 2.2, 0.6]]) add(s, box(1.0, h, 1.0), M(0xbfe3f2, { r: 0.4 }), x, h / 2, z);
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const fn of this.anims) fn(t, dt);
    this.sporeData.forEach((s, i) => {
      s.y += s.speed * dt;
      if (s.y > 3.6) s.y = 0;
      this.sporePos.set([s.x + Math.sin(t * 0.5 + s.sway) * 0.4, s.y, s.z + Math.cos(t * 0.4 + s.sway) * 0.4], i * 3);
    });
    this.sporePoints.geometry.attributes.position.needsUpdate = true;
  }
}

const PALETTE_SLEEP = [0xd18bff, 0x9bffb0, 0xffd28b];
