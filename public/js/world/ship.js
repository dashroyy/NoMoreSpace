// Builds the ship: floors, walls with doorways, windows, room props, task
// consoles, the bridge table and the easels where night drawings appear.
import * as THREE from 'three';
import { ROOMS, CORRIDORS, TASK_STATIONS, DRAWING_SLOTS, TABLE_RADIUS, seatPosition, wallSegments } from './layout.js';
import { buildDecor } from './decor.js';
import { makeTextSprite } from './avatar.js';

const WALL_H = 2.4;
const LOW_WALL_H = 0.9; // south-facing walls are low so they don't hide players from the camera

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.2, ...extra });
const glowMat = (color, intensity = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

function add(group, geometry, material, x, y, z, rot = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  group.add(mesh);
  return mesh;
}

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  for (let i = 16; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffcc00';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111';
  for (let i = -64; i < 128; i += 24) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 12, 0);
    g.lineTo(i + 76, 64);
    g.lineTo(i + 64, 64);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function floorLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 72px Orbitron, Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.globalAlpha = 0.5;
  g.fillText(text.toUpperCase(), 512, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildShip(scene, space) {
  const ship = new THREE.Group();
  scene.add(ship);
  const panel = panelTexture();
  const wallMat = m(0x2a3046, { roughness: 0.6, metalness: 0.45 });
  const lowWallMat = m(0x242a3e, { roughness: 0.6, metalness: 0.45 });
  const lights = [];
  const flicker = [];
  const stations = {};
  const all = [...ROOMS.map((r) => r.rect), ...CORRIDORS];

  // ---------- floors ----------
  for (const rect of all) {
    const [x0, z0, x1, z1] = rect;
    const room = ROOMS.find((r) => r.rect === rect);
    const w = x1 - x0;
    const d = z1 - z0;
    const tex = panel.clone();
    tex.repeat.set(w / 2, d / 2);
    tex.needsUpdate = true;
    const floor = add(ship, new THREE.PlaneGeometry(w, d), m(room ? room.floor : 0x262c44, { map: tex, roughness: 0.85 }), (x0 + x1) / 2, 0, (z0 + z1) / 2, [-Math.PI / 2, 0, 0]);
    floor.receiveShadow = false;
    // hull underside, so the ship looks solid from above the edges
    add(ship, new THREE.BoxGeometry(w, 0.6, d), m(0x0b0d16), (x0 + x1) / 2, -0.31, (z0 + z1) / 2);
  }

  // ---------- walls & windows ----------
  for (const rect of all) {
    const room = ROOMS.find((r) => r.rect === rect);
    const trimMat = glowMat(room ? room.light : 0x4a6cff, 0.9);
    for (const seg of wallSegments(rect, all.filter((o) => o !== rect))) {
      const len = seg.to - seg.from;
      const low = seg.side === 'south';
      const h = low ? LOW_WALL_H : WALL_H;
      const mid = (seg.from + seg.to) / 2;
      const [x, z] = seg.axis === 'x' ? [mid, seg.fixed] : [seg.fixed, mid];
      const [sx, sz] = seg.axis === 'x' ? [len + 0.3, 0.3] : [0.3, len + 0.3];
      add(ship, new THREE.BoxGeometry(sx, h, sz), low ? lowWallMat : wallMat, x, h / 2, z);
      add(ship, new THREE.BoxGeometry(sx * (seg.axis === 'x' ? 1 : 0.5), 0.05, sz * (seg.axis === 'z' ? 1 : 0.5)), trimMat, x, h + 0.03, z);

      // Windows on the north walls of rooms look out into space.
      if (room && seg.side === 'north' && len > 3) {
        const big = room.id === 'observation';
        const w = big ? len - 2 : Math.min(len - 1.2, 5);
        const tex = big ? space.bigTex : space.smallTex.clone();
        if (!big) {
          tex.repeat.set(w / 10, 0.9);
          tex.offset.set(Math.random() * 0.6, 0.05);
          tex.needsUpdate = true;
          space.windowTextures.push(tex);
        }
        const wh = big ? 2.0 : 1.2;
        const win = add(ship, new THREE.PlaneGeometry(w, wh), new THREE.MeshBasicMaterial({ map: tex }), x, big ? 1.25 : 1.35, z + 0.17);
        win.userData.window = true;
        // frame
        add(ship, new THREE.BoxGeometry(w + 0.2, 0.12, 0.1), m(0x5a6584, { metalness: 0.8 }), x, (big ? 1.25 : 1.35) + wh / 2, z + 0.2);
        add(ship, new THREE.BoxGeometry(w + 0.2, 0.12, 0.1), m(0x5a6584, { metalness: 0.8 }), x, (big ? 1.25 : 1.35) - wh / 2, z + 0.2);
      }
    }
  }

  // ---------- room lights, labels, props ----------
  for (const room of ROOMS) {
    const [x0, z0, x1, z1] = room.rect;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const light = new THREE.PointLight(room.light, 40, Math.max(x1 - x0, z1 - z0) * 1.8, 1);
    light.position.set(cx, 5, cz);
    ship.add(light);
    lights.push(light);
    light.userData.base = light.intensity;
    if (['reactor', 'airlock', 'engine', 'cargo'].includes(room.id)) flicker.push(light);

    const label = floorLabel(room.name, '#' + new THREE.Color(room.light).getHexString());
    label.position.set(cx, 0.02, z0 + 1.2);
    ship.add(label);

    buildProps(ship, room, cx, cz);
  }

  // ---------- task consoles ----------
  for (const [taskId, pos] of Object.entries(TASK_STATIONS)) {
    const room = ROOMS.find((r) => r.task === taskId);
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    add(g, new THREE.BoxGeometry(1.0, 0.9, 0.6), m(0x3a4260, { metalness: 0.6 }), 0, 0.45, 0);
    const screenMat = glowMat(room?.light || 0x6cf0ff, 1.4);
    add(g, new THREE.BoxGeometry(0.85, 0.05, 0.45), screenMat, 0, 0.93, 0.02, [-0.5, 0, 0]);
    const ring = add(g, new THREE.TorusGeometry(0.85, 0.04, 6, 32), glowMat(0x6cf0ff, 1.2), 0, 0.03, 0, [Math.PI / 2, 0, 0]);
    const icon = makeTextSprite('🛠️', { size: 64, scale: 0.008 });
    icon.position.y = 1.7;
    g.add(icon);
    g.userData.dynamic = true;
    ship.add(g);
    stations[taskId] = { group: g, ring, screenMat, icon, room: room?.id };
  }

  // ---------- bridge: table, hologram, seats ----------
  const bridge = new THREE.Group();
  ship.add(bridge);
  add(bridge, new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS * 0.85, 0.9, 40), m(0x1c2136, { metalness: 0.6, roughness: 0.4 }), 0, 0.45, 0);
  add(bridge, new THREE.TorusGeometry(TABLE_RADIUS - 0.1, 0.05, 6, 48), glowMat(0x7f6bff, 1.5), 0, 0.92, 0, [Math.PI / 2, 0, 0]);
  const holo = new THREE.Group();
  holo.position.y = 1.9;
  add(holo, new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0, 0);
  const disk = add(holo, new THREE.TorusGeometry(0.85, 0.16, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.75 }), 0, 0, 0, [Math.PI / 2.3, 0, 0]);
  add(holo, new THREE.TorusGeometry(0.52, 0.03, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 0, 0, 0);
  add(holo, new THREE.ConeGeometry(0.9, 1.0, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x7f6bff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }), 0, -0.55, 0, [Math.PI, 0, 0]);
  bridge.add(holo);
  holo.userData.dynamic = true;
  const seats = new THREE.Group();
  seats.userData.dynamic = true;
  bridge.add(seats);

  function setSeats(count) {
    seats.clear();
    const chairMat = m(0x343b58, { metalness: 0.5 });
    for (let i = 0; i < count; i++) {
      const { x, z, facing } = seatPosition(i, count);
      const chair = new THREE.Group();
      chair.position.set(x, 0, z);
      chair.rotation.y = facing;
      add(chair, new THREE.BoxGeometry(0.8, 0.12, 0.8), chairMat, 0, 0.45, -0.25);
      add(chair, new THREE.BoxGeometry(0.8, 0.9, 0.12), chairMat, 0, 0.9, -0.62);
      add(chair, new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), chairMat, 0, 0.22, -0.25);
      seats.add(chair);
    }
  }

  // ---------- easels for night drawings ----------
  const easels = DRAWING_SLOTS.map(({ x, z }) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    add(g, new THREE.BoxGeometry(0.06, 1.4, 0.06), m(0x6b4a2b), -0.6, 0.7, -0.1, [0.15, 0, 0]);
    add(g, new THREE.BoxGeometry(0.06, 1.4, 0.06), m(0x6b4a2b), 0.6, 0.7, -0.1, [0.15, 0, 0]);
    add(g, new THREE.BoxGeometry(1.75, 1.35, 0.06), m(0x8a6a3b), 0, 1.45, 0, [-0.35, 0, 0]);
    const art = add(g, new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 1.45, 0.035, [-0.35, 0, 0]);
    // move the art plane slightly in front of the tilted frame
    art.position.add(new THREE.Vector3(0, Math.sin(0.35) * 0.03, Math.cos(0.35) * 0.03));
    g.visible = false;
    g.userData.dynamic = true;
    ship.add(g);
    return { group: g, art };
  });

  const decor = buildDecor(ship);
  mergeStatic(ship);

  return {
    group: ship,
    decor,
    lights,
    flicker,
    stations,
    holo,
    disk,
    setSeats,
    easels,
  };
}

// Little bits of scenery per room.
function buildProps(ship, room, cx, cz) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  ship.add(g);
  const metal = m(0x4a5272, { metalness: 0.7, roughness: 0.35 });
  switch (room.id) {
    case 'observation': {
      add(g, new THREE.CylinderGeometry(0.25, 0.35, 2.2, 12), metal, -4, 1.4, -3, [0.6, 0, 0]);
      for (const s of [-1, 0, 1]) add(g, new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), metal, -4 + s * 0.4, 0.6, -2.4 + Math.abs(s) * 0.2, [0.2 * s, 0, -0.3 * s]);
      for (const x of [-5, 0, 5]) add(g, new THREE.BoxGeometry(2.6, 0.45, 0.8), m(0x2b2440), x, 0.25, 2.5);
      break;
    }
    case 'navigation': {
      add(g, new THREE.CylinderGeometry(2.2, 2.2, 0.8, 32), metal, 0, 0.4, 1);
      const map = add(g, new THREE.CircleGeometry(2.05, 32), glowMat(0x0b3b3a, 0.8), 0, 0.82, 1, [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 18; i++) add(map, new THREE.SphereGeometry(0.05, 6, 4), glowMat(0x58ffd0, 3), (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.03);
      break;
    }
    case 'comms': {
      const dish = add(g, new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.5), m(0xc8d0e0, { metalness: 0.6, side: THREE.DoubleSide }), -4, 1.6, 1, [-0.9, 0, 0]);
      add(dish, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), metal, 0, 0.6, 0);
      add(g, new THREE.CylinderGeometry(0.15, 0.25, 1.4, 8), metal, -4, 0.7, 1);
      for (const x of [2, 4.5]) add(g, new THREE.BoxGeometry(1.8, 1.0, 0.7), metal, x, 0.5, 3);
      break;
    }
    case 'medbay': {
      for (const x of [-4, 0]) {
        add(g, new THREE.BoxGeometry(2.2, 0.6, 1.1), m(0xdfe6ee), x, 0.5, -3.5);
        add(g, new THREE.BoxGeometry(0.7, 0.18, 0.9), m(0xffffff), x - 0.7, 0.88, -3.5);
      }
      add(g, new THREE.TorusGeometry(1.1, 0.12, 8, 30), glowMat(0x7dffb0, 1.2), 4, 1.1, -3, [Math.PI / 2, 0, 0]);
      add(g, new THREE.CylinderGeometry(1.1, 1.1, 0.06, 30), glowMat(0x1c4a36, 0.6), 4, 0.03, -3);
      break;
    }
    case 'galley': {
      for (const [x, z] of [[-3.5, 2], [1, 2]]) {
        add(g, new THREE.BoxGeometry(3, 0.12, 1.4), m(0x6b4a2b), x, 0.8, z);
        add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), metal, x, 0.4, z);
      }
      const pot = add(g, new THREE.CylinderGeometry(0.7, 0.6, 1.0, 20), m(0x9aa4b8, { metalness: 0.8 }), 5, 0.5, -3);
      add(pot, new THREE.CircleGeometry(0.66, 20), glowMat(0xffcf7a, 0.9), 0, 0.51, 0, [-Math.PI / 2, 0, 0]);
      break;
    }
    case 'reactor': {
      const core = add(g, new THREE.CylinderGeometry(1.1, 1.1, 3.4, 24), glowMat(0xff3d6b, 1.8), 0, 1.7, 0);
      core.userData.pulse = true;
      add(g, new THREE.TorusGeometry(1.5, 0.15, 8, 30), metal, 0, 0.6, 0, [Math.PI / 2, 0, 0]);
      add(g, new THREE.TorusGeometry(1.5, 0.15, 8, 30), metal, 0, 2.8, 0, [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.2, 0.2, 6, 8), metal, s * 4.5, 0.3, -2, [0, 0, Math.PI / 2]);
      ship.userData.reactorCore = core;
      break;
    }
    case 'engine': {
      for (const x of [-5, 5]) {
        add(g, new THREE.CylinderGeometry(1.4, 1.8, 4, 20), metal, x, 1.8, 3, [Math.PI / 2, 0, 0]);
        add(g, new THREE.CircleGeometry(1.5, 20), glowMat(0x6cc8ff, 2.2), x, 1.8, 5.02);
      }
      add(g, new THREE.BoxGeometry(3, 1, 1.5), metal, 0, 0.5, -3);
      break;
    }
    case 'hydroponics': {
      for (let i = 0; i < 4; i++) {
        const x = -5 + i * 3.2;
        add(g, new THREE.BoxGeometry(2.4, 0.5, 1.2), m(0x4a3423), x, 0.25, -2.5);
        for (let k = 0; k < 3; k++) {
          const h = 0.6 + Math.random() * 0.8;
          add(g, new THREE.ConeGeometry(0.18, h, 6), glowMat([0x9bff6b, 0x6bffd8, 0xd27bff][(i + k) % 3], 0.5), x - 0.7 + k * 0.7, 0.5 + h / 2, -2.5);
          add(g, new THREE.SphereGeometry(0.12, 8, 6), glowMat(0xffe14f, 1.5), x - 0.7 + k * 0.7, 0.55 + h, -2.5);
        }
      }
      break;
    }
    case 'airlock': {
      const door = add(g, new THREE.BoxGeometry(0.3, 2.4, 6.5), m(0xffffff, { map: hazardTexture(), metalness: 0.4 }), -3.7, 1.2, 0);
      door.material.map.repeat.set(6, 2);
      add(g, new THREE.SphereGeometry(0.18, 10, 8), glowMat(0xff2030, 3), -3.4, 2.5, -2.8);
      add(g, new THREE.SphereGeometry(0.18, 10, 8), glowMat(0xff2030, 3), -3.4, 2.5, 2.8);
      break;
    }
    case 'quarters': {
      for (const x of [-4, -1.5, 1]) {
        add(g, new THREE.BoxGeometry(1.8, 0.4, 2.6), m(0x3a3150), x, 0.4, 3);
        add(g, new THREE.BoxGeometry(1.6, 0.15, 2.4), m(0x8f7ad8), x, 0.65, 3);
        add(g, new THREE.CapsuleGeometry(0.75, 1.6, 4, 12), new THREE.MeshStandardMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.18 }), x, 1.2, 3, [Math.PI / 2, 0, 0]);
      }
      // the ship cat
      const cat = new THREE.Group();
      cat.position.set(3.5, 0, 1.5);
      add(cat, new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), m(0xff9a3c), 0, 0.25, 0, [Math.PI / 2, 0, 0]);
      add(cat, new THREE.SphereGeometry(0.19, 10, 8), m(0xff9a3c), 0, 0.4, 0.35);
      for (const s of [-1, 1]) add(cat, new THREE.ConeGeometry(0.06, 0.12, 4), m(0xff9a3c), s * 0.1, 0.58, 0.35);
      cat.userData.dynamic = true;
      g.add(cat);
      ship.userData.cat = cat;
      break;
    }
    case 'cargo': {
      for (let i = 0; i < 9; i++) {
        const s = 0.8 + Math.random() * 0.8;
        const crate = add(g, new THREE.BoxGeometry(s, s, s), m([0x8a6a3b, 0x5a6b3b, 0x6b3b3b][i % 3]), -7 + (i % 5) * 2.5 + Math.random(), s / 2, -2 + Math.floor(i / 5) * 4 + Math.random());
        crate.rotation.y = Math.random();
      }
      break;
    }
    case 'bridge': {
      add(g, new THREE.BoxGeometry(4, 1, 0.8), metal, 0, 0.5, -9);
      add(g, new THREE.BoxGeometry(3.6, 0.05, 0.6), glowMat(0x7f6bff, 1.2), 0, 1.03, -9, [-0.4, 0, 0]);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Performance: merge the hundreds of static pieces that share a look into a
// few big meshes, so the graphics card has far fewer things to draw.
// ---------------------------------------------------------------------------

function materialKey(m) {
  return [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.metalness, m.roughness, m.map?.uuid, m.transparent, m.opacity, m.side].join('|');
}

function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const merged = [];
  const walk = (obj) => {
    if (obj.userData.dynamic || obj.userData.window || obj.userData.pulse || obj.isInstancedMesh) return;
    if (obj.isMesh && !Array.isArray(obj.material) && obj.geometry.index) {
      const key = materialKey(obj.material);
      if (!buckets.has(key)) buckets.set(key, { material: obj.material, meshes: [] });
      buckets.get(key).meshes.push(obj);
    }
    for (const child of obj.children) walk(child);
  };
  for (const child of root.children) walk(child);

  for (const { material, meshes } of buckets.values()) {
    if (!meshes.length) continue;
    let vertices = 0;
    let indices = 0;
    for (const mesh of meshes) {
      vertices += mesh.geometry.attributes.position.count;
      indices += mesh.geometry.index.count;
    }
    const pos = new Float32Array(vertices * 3);
    const nor = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const idx = new Uint32Array(indices);
    let vo = 0;
    let io = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
      vo += n;
      io += src.length;
      g.dispose();
      merged.push(mesh);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.computeBoundingSphere();
    root.add(new THREE.Mesh(geometry, material));
  }
  for (const mesh of merged) {
    mesh.removeFromParent();
    // keep any children that were not merged (none expected, but be safe)
  }
}
