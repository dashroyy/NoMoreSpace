// Decorations: spooky-festive touches (fairy lights, jack-o'-lanterns,
// cobwebs, bunting) and spaceship details (pipes, pillars, blinking panels,
// server racks, data screens, glowing floor strips, hazard stripes).
//
// Placement uses a fixed random seed so every player sees the same ship.
import * as THREE from 'three';
import { ROOMS, CORRIDORS, TASK_STATIONS, wallSegments } from './layout.js';

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...extra });

function add(group, geometry, material, x, y, z, rot = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

function pumpkinFaceTexture() {
  return canvasTexture(256, 160, (g, w, h) => {
    const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    glow.addColorStop(0, '#fff3a0');
    glow.addColorStop(0.5, '#ffb020');
    glow.addColorStop(1, '#ff6a00');
    g.fillStyle = glow;
    // two triangle eyes
    for (const x of [70, 186]) {
      g.beginPath();
      g.moveTo(x - 30, 70);
      g.lineTo(x + 30, 70);
      g.lineTo(x, 22);
      g.closePath();
      g.fill();
    }
    // nose
    g.beginPath();
    g.moveTo(118, 92);
    g.lineTo(138, 92);
    g.lineTo(128, 76);
    g.closePath();
    g.fill();
    // jagged grin
    g.beginPath();
    g.moveTo(34, 104);
    const teeth = [[64, 118], [84, 104], [104, 124], [128, 108], [152, 124], [172, 104], [192, 118], [222, 104]];
    for (const [x, y] of teeth) g.lineTo(x, y);
    g.lineTo(196, 146);
    g.lineTo(60, 146);
    g.closePath();
    g.fill();
  });
}

function glowTexture(inner, outer) {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

function cobwebTexture() {
  return canvasTexture(256, 256, (g) => {
    g.strokeStyle = 'rgba(235,240,255,0.55)';
    g.lineWidth = 1.5;
    // a fan of web hanging from the top centre (it spans the corner between two walls)
    const cx = 128;
    const spokes = 9;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI;
      g.beginPath();
      g.moveTo(cx, 0);
      g.lineTo(cx + Math.cos(a) * 130, Math.sin(a) * 250);
      g.stroke();
    }
    for (let r = 0.12; r < 1; r += 0.12) {
      g.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI;
        const sag = 0.85 + 0.15 * Math.sin(i * 1.7 + r * 9);
        const x = cx + Math.cos(a) * 130 * r * sag;
        const y = Math.sin(a) * 250 * r * sag;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    // a tiny spider
    g.fillStyle = 'rgba(20,20,30,0.9)';
    g.beginPath();
    g.arc(150, 120, 7, 0, Math.PI * 2);
    g.fill();
  });
}

function dataScreenTexture() {
  const tex = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#031014';
    g.fillRect(0, 0, w, h);
    g.font = '14px monospace';
    const rnd = seeded(7);
    const lines = ['O2 LEVEL', 'HULL STRESS', 'GRAV DRIFT', 'EVENT HORIZON', 'CREW VITALS', 'LIFE SIGNS', 'REACTOR TEMP', 'NAV LOCK', 'ANOMALY', 'SIGNAL LOST', 'UNKNOWN BIO'];
    for (let y = 16; y < h; y += 20) {
      const warn = rnd() < 0.12;
      g.fillStyle = warn ? '#ff5a6e' : rnd() < 0.5 ? '#5cf2c8' : '#4fb8ff';
      const label = lines[Math.floor(rnd() * lines.length)];
      g.fillText(`${label} ${(rnd() * 999).toFixed(1)}${warn ? ' !!' : ''}`, 10, y);
    }
    // a little graph
    g.strokeStyle = '#5cf2c8';
    g.beginPath();
    for (let x = 0; x < w; x += 6) g.lineTo(x, 470 + Math.sin(x * 0.08) * 18 + rnd() * 8);
    g.stroke();
  });
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.5);
  return tex;
}

function hazardTexture() {
  const tex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#ffcc00';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#15151c';
    for (let i = -64; i < 128; i += 24) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 12, 0);
      g.lineTo(i + 76, 64);
      g.lineTo(i + 64, 64);
      g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A pumpkin: a squashed sphere with ribs.
function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const rib = 1 - 0.09 * (0.5 + 0.5 * Math.cos(a * 10));
    pos.setXYZ(i, v.x * rib, v.y * 0.72, v.z * rib);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------

export function buildDecor(ship) {
  const rnd = seeded(2026);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const all = [...ROOMS.map((r) => r.rect), ...CORRIDORS];
  const nearStation = (x, z, r = 2.2) => Object.values(TASK_STATIONS).some((s) => Math.hypot(s.x - x, s.z - z) < r);
  const nearDoor = (x, z, r = 2.4) => CORRIDORS.some(([x0, z0, x1, z1]) => Math.hypot((x0 + x1) / 2 - x, (z0 + z1) / 2 - z) < r + Math.max(x1 - x0, z1 - z0) / 2 - 1);
  const blocked = (x, z) => nearStation(x, z) || nearDoor(x, z);

  // shared materials (shared so merged meshes still animate together)
  const pipeMat = m(0x5d677d, { metalness: 0.75, roughness: 0.35 });
  const jointMat = m(0xa3adc2, { metalness: 0.8, roughness: 0.3 });
  const pillarMat = m(0x2c3350, { metalness: 0.5, roughness: 0.5 });
  const panelMat = m(0x161b2b, { metalness: 0.4 });
  const rackMat = m(0x1d2233, { metalness: 0.5, roughness: 0.4 });
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x4fd6ff, emissiveIntensity: 1.3 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
  const screenTex = dataScreenTexture();
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const pumpkinMat = m(0xff7a1a, { roughness: 0.6, emissive: 0x401400, emissiveIntensity: 0.4 });
  const stemMat = m(0x4a6b2a);
  const faceMat = new THREE.MeshBasicMaterial({ map: pumpkinFaceTexture(), transparent: true, depthWrite: false });
  const candleGlowMat = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,160,40,0.55)', 'rgba(255,120,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const webMat = new THREE.MeshBasicMaterial({ map: cobwebTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const flagMats = [0xff7a1a, 0x7b3fe4, 0x15151c, 0x7fe33b].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 }));
  const pumpkinGeo = pumpkinGeometry();

  const bulbs = []; // fairy lights
  const leds = []; // blinking panel lights
  const wire = [];

  // ---------- fairy lights along the tops of the walls ----------
  const BULB_COLORS = [0xffe6b0, 0xffb347, 0xff7a1a, 0xb06bff, 0x5ce1e6, 0xff6fb5, 0xff7a1a, 0xb06bff];
  function stringLights(ax, az, bx, bz, y, sag) {
    const len = Math.hypot(bx - ax, bz - az);
    const spans = Math.max(1, Math.round(len / 3));
    for (let s = 0; s < spans; s++) {
      const n = Math.max(3, Math.round(len / spans / 0.42));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const u = (s + i / n) / spans;
        const x = ax + (bx - ax) * u;
        const z = az + (bz - az) * u;
        const yy = y - sag * 4 * (i / n) * (1 - i / n);
        if (prev) wire.push(...prev, x, yy, z);
        prev = [x, yy, z];
        if (i > 0 && i < n) bulbs.push({ x, y: yy - 0.07, z, color: pick(BULB_COLORS), speed: 0.6 + rnd() * 2.6, phase: rnd() * 6.28 });
      }
    }
  }

  for (const room of ROOMS) {
    const others = all.filter((o) => o !== room.rect);
    for (const seg of wallSegments(room.rect, others)) {
      if (seg.side === 'south' || seg.to - seg.from < 1.5) continue;
      const y = room.id === 'observation' && seg.side === 'north' ? 2.38 : 2.3;
      const sag = room.id === 'observation' && seg.side === 'north' ? 0.08 : 0.28;
      if (seg.side === 'north') stringLights(seg.from + 0.3, seg.fixed + 0.22, seg.to - 0.3, seg.fixed + 0.22, y, sag);
      if (seg.side === 'west') stringLights(seg.fixed + 0.22, seg.from + 0.3, seg.fixed + 0.22, seg.to - 0.3, y, sag);
      if (seg.side === 'east') stringLights(seg.fixed - 0.22, seg.from + 0.3, seg.fixed - 0.22, seg.to - 0.3, y, sag);
    }
  }

  // ---------- jack-o'-lanterns ----------
  function pumpkin(x, z, size, face, y = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = (rnd() - 0.5) * 0.6;
    add(g, pumpkinGeo, pumpkinMat, 0, size * 0.7, 0, null, [size, size, size]);
    add(g, new THREE.CylinderGeometry(size * 0.08, size * 0.12, size * 0.35, 6), stemMat, 0, size * 1.38, 0, [0.2, 0, 0.15]);
    if (face) {
      add(g, new THREE.PlaneGeometry(size * 1.5, size * 0.95), faceMat, 0, size * 0.8, size * 1.02, [-0.6, 0, 0]);
      add(g, new THREE.PlaneGeometry(size * 5, size * 5), candleGlowMat, 0, 0.02, size * 0.9, [-Math.PI / 2, 0, 0]);
    }
    ship.add(g);
  }
  for (const room of ROOMS) {
    const [x0, z0, x1, z1] = room.rect;
    const corners = [[x0 + 1.1, z0 + 1.2], [x1 - 1.1, z0 + 1.2], [x0 + 1.1, z1 - 1.1], [x1 - 1.1, z1 - 1.1]].filter(([x, z]) => !blocked(x, z));
    const count = Math.min(corners.length, room.id === 'bridge' ? 0 : 2);
    for (let i = 0; i < count; i++) {
      const [x, z] = corners.splice(Math.floor(rnd() * corners.length), 1)[0];
      const big = 0.32 + rnd() * 0.16;
      pumpkin(x, z, big, true);
      if (rnd() < 0.6) pumpkin(x + (x < (x0 + x1) / 2 ? 0.75 : -0.75), z + 0.25, 0.18 + rnd() * 0.08, rnd() < 0.5);
    }
  }
  // a pumpkin patch either side of the bridge console, and one on the galley table
  pumpkin(-3.2, -8.3, 0.42, true);
  pumpkin(-2.4, -8.0, 0.22, false);
  pumpkin(3.2, -8.3, 0.4, true);
  pumpkin(22.5, 2, 0.22, true, 0.86);

  // ---------- cobwebs in the top corners ----------
  for (const room of ROOMS) {
    const [x0, z0, x1] = room.rect;
    if (rnd() < 0.75) add(ship, new THREE.PlaneGeometry(1.4, 1.4), webMat, x0 + 0.5, 1.85, z0 + 0.5, [0, Math.PI / 4, 0]);
    if (rnd() < 0.5) add(ship, new THREE.PlaneGeometry(1.4, 1.4), webMat, x1 - 0.5, 1.85, z0 + 0.5, [0, -Math.PI / 4, 0]);
  }

  // ---------- bunting across a few rooms ----------
  const triangle = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.16, 0), new THREE.Vector2(0.16, 0), new THREE.Vector2(0, -0.34)]));
  for (const id of ['galley', 'quarters', 'medbay', 'hydroponics', 'bridge']) {
    const [x0, z0, x1] = ROOMS.find((r) => r.id === id).rect;
    const z = z0 + (id === 'bridge' ? 2.2 : 3);
    const y = 2.7;
    const sag = 0.45;
    const n = Math.round((x1 - x0 - 0.6) / 0.5);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = x0 + 0.3 + (x1 - x0 - 0.6) * u;
      const yy = y - sag * 4 * u * (1 - u);
      if (prev) wire.push(...prev, x, yy, z);
      prev = [x, yy, z];
      if (i > 0 && i < n) add(ship, triangle, flagMats[i % flagMats.length], x, yy, z, [-0.35, 0, 0]);
    }
  }

  // ---------- spaceship details ----------
  for (const room of ROOMS) {
    const [x0, z0, x1, z1] = room.rect;
    const others = all.filter((o) => o !== room.rect);
    const trim = new THREE.MeshStandardMaterial({ color: room.light, emissive: room.light, emissiveIntensity: 1.4 });

    // glowing pillars in the two back corners
    for (const x of [x0 + 0.32, x1 - 0.32]) {
      add(ship, new THREE.BoxGeometry(0.5, 2.5, 0.5), pillarMat, x, 1.25, z0 + 0.32);
      add(ship, new THREE.BoxGeometry(0.06, 2.2, 0.06), trim, x + (x === x0 + 0.32 ? 0.27 : -0.27), 1.2, z0 + 0.6);
    }

    for (const seg of wallSegments(room.rect, others)) {
      const len = seg.to - seg.from;
      if (seg.side === 'south' || len < 2.5) continue;
      // twin pipes along the bottom of the walls
      if (['engine', 'reactor', 'cargo', 'airlock', 'hydroponics', 'navigation', 'comms', 'medbay'].includes(room.id)) {
        const mid = (seg.from + seg.to) / 2;
        const inset = seg.side === 'east' ? -0.26 : 0.26;
        for (const [r, y] of [[0.07, 0.32], [0.05, 0.55]]) {
          if (seg.axis === 'x') {
            add(ship, new THREE.CylinderGeometry(r, r, len - 0.6, 10), pipeMat, mid, y, seg.fixed + 0.26, [0, 0, Math.PI / 2]);
            for (let p = seg.from + 1; p < seg.to - 0.6; p += 1.8) add(ship, new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.09, 10), jointMat, p, y, seg.fixed + 0.26, [0, 0, Math.PI / 2]);
          } else {
            add(ship, new THREE.CylinderGeometry(r, r, len - 0.6, 10), pipeMat, seg.fixed + inset, y, mid, [Math.PI / 2, 0, 0]);
            for (let p = seg.from + 1; p < seg.to - 0.6; p += 1.8) add(ship, new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.09, 10), jointMat, seg.fixed + inset, y, p, [Math.PI / 2, 0, 0]);
          }
        }
      }
      // blinking control panels on the side walls
      if (seg.axis === 'z' && len > 4) {
        const zc = (seg.from + seg.to) / 2;
        const dir = seg.side === 'west' ? 1 : -1;
        const px = seg.fixed + dir * 0.19;
        add(ship, new THREE.BoxGeometry(0.08, 0.9, 1.5), panelMat, px, 1.35, zc);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) leds.push({ x: px + dir * 0.05, y: 1.08 + r * 0.17, z: zc - 0.6 + c * 0.17, color: pick([0x5bff8f, 0xffc23b, 0xff3b5c, 0x4fd6ff, 0x5bff8f]), speed: 0.5 + rnd() * 3, phase: rnd() * 6.28 });
      }
    }

    // holographic data screen near the back wall
    const sx = rnd() < 0.5 ? x0 + 2.2 : x1 - 2.2;
    if (!blocked(sx, z0 + 1.3) && room.id !== 'bridge') {
      add(ship, new THREE.CylinderGeometry(0.04, 0.06, 1.0, 6), jointMat, sx, 0.5, z0 + 1.2);
      add(ship, new THREE.PlaneGeometry(1.3, 0.85), screenMat, sx, 1.35, z0 + 1.25, [-0.25, 0, 0]);
    }
  }

  // server racks with blinking lights
  for (const [x, z] of [[-8.3, -6.5], [8.3, -6.5], [21, -28.9], [22, -28.9], [-21.5, -28.9], [-8.6, 46.8], [-7.6, 46.8]]) {
    add(ship, new THREE.BoxGeometry(0.85, 2.1, 0.6), rackMat, x, 1.05, z);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) leds.push({ x: x - 0.2 + c * 0.2, y: 0.35 + r * 0.19, z: z + 0.31, color: pick([0x5bff8f, 0x4fd6ff, 0x5bff8f, 0xffc23b]), speed: 1 + rnd() * 4, phase: rnd() * 6.28 });
  }

  // corridors: glowing floor strips and hazard stripes where they meet rooms
  for (const [x0, z0, x1, z1] of CORRIDORS) {
    const along = x1 - x0 > z1 - z0 ? 'x' : 'z';
    if (along === 'x') {
      for (const z of [z0 + 0.14, z1 - 0.14]) add(ship, new THREE.BoxGeometry(x1 - x0, 0.03, 0.07), stripMat, (x0 + x1) / 2, 0.02, z);
      for (const x of [x0 + 0.3, x1 - 0.3]) {
        const stripe = add(ship, new THREE.PlaneGeometry(0.5, z1 - z0), hazardMat, x, 0.012, (z0 + z1) / 2, [-Math.PI / 2, 0, 0]);
        stripe.userData.hazard = true;
      }
    } else {
      for (const x of [x0 + 0.14, x1 - 0.14]) add(ship, new THREE.BoxGeometry(0.07, 0.03, z1 - z0), stripMat, x, 0.02, (z0 + z1) / 2);
      for (const z of [z0 + 0.3, z1 - 0.3]) add(ship, new THREE.PlaneGeometry(x1 - x0, 0.5), hazardMat, (x0 + x1) / 2, 0.012, z, [-Math.PI / 2, 0, 0]);
    }
  }

  // ---------- instanced lights (one draw call each) ----------
  function instanced(list, geometry) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    list.forEach((b, i) => {
      mtx.setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, mtx);
      mesh.setColorAt(i, col.setHex(b.color));
      b.base = new THREE.Color(b.color);
    });
    mesh.userData.dynamic = true;
    mesh.frustumCulled = false;
    ship.add(mesh);
    return mesh;
  }
  const bulbMesh = instanced(bulbs, new THREE.SphereGeometry(0.08, 6, 4));
  const ledMesh = instanced(leds, new THREE.BoxGeometry(0.06, 0.06, 0.06));

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  ship.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2a33 })));

  // ---------- animation ----------
  let last = 0;
  const col = new THREE.Color();
  return {
    bulbCount: bulbs.length,
    update(t, { night = false, progress = 0 } = {}) {
      screenTex.offset.y = (t * 0.03) % 1;
      // pumpkins flicker like candles
      const flick = 0.75 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.08 + Math.random() * 0.09;
      faceMat.color.setScalar(flick);
      candleGlowMat.opacity = 0.6 + (flick - 0.75) * 2;
      if (t - last < 0.08) return;
      last = t;
      // fairy lights twinkle (and stutter more as the black hole gets closer)
      const stutter = 0.02 + progress * 0.12;
      bulbs.forEach((b, i) => {
        let k = 0.55 + 0.45 * Math.sin(t * b.speed + b.phase);
        if (Math.random() < stutter) k = 0.1;
        bulbMesh.setColorAt(i, col.copy(b.base).multiplyScalar(night ? k * 0.6 : k));
      });
      bulbMesh.instanceColor.needsUpdate = true;
      leds.forEach((l, i) => {
        const on = Math.sin(t * l.speed + l.phase) > -0.2;
        ledMesh.setColorAt(i, col.copy(l.base).multiplyScalar(on ? 1 : 0.12));
      });
      ledMesh.instanceColor.needsUpdate = true;
    },
  };
}
