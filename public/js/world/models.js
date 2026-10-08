// Secret character models, only revealed in the end-game cinematic.
// Each player's suit colour is used as an accent so you can still tell who's who.
import * as THREE from 'three';

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });
const glow = (color, intensity = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

function part(group, geometry, material, x = 0, y = 0, z = 0, rot = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

const SKINS = [0xf1c7a1, 0xd9a27a, 0xa86f4b, 0x7a4b2e, 0xffe0bd];

// A friendly cartoon person. Returns handles for attaching props.
function person({ outfit, pants = 0x2b2f3a, skin = SKINS[0], head = 'human' }) {
  const g = new THREE.Group();
  const outfitMat = m(outfit);
  for (const s of [-1, 1]) part(g, new THREE.CapsuleGeometry(0.12, 0.42, 4, 8), m(pants), s * 0.14, 0.33, 0);
  part(g, new THREE.CapsuleGeometry(0.3, 0.45, 6, 14), outfitMat, 0, 0.95, 0);
  const armL = part(g, new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), outfitMat, -0.4, 0.98, 0, [0, 0, 0.2]);
  const armR = part(g, new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), outfitMat, 0.4, 0.98, 0, [0, 0, -0.2]);
  let headMesh;
  if (head === 'human') {
    headMesh = part(g, new THREE.SphereGeometry(0.27, 18, 14), m(skin), 0, 1.55, 0);
    for (const s of [-1, 1]) part(g, new THREE.SphereGeometry(0.035, 8, 6), m(0x111111), s * 0.1, 1.58, 0.24);
    part(g, new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), m(0x5a2a2a), 0, 1.47, 0.24, [0, 0, Math.PI]);
  }
  const hand = new THREE.Group();
  hand.position.set(0.48, 0.72, 0.12);
  g.add(hand);
  const hatAt = new THREE.Group();
  hatAt.position.y = 1.78;
  g.add(hatAt);
  return { g, armL, armR, head: headMesh, hand, hatAt, outfitMat };
}

function capHat(at, color, brimColor = color) {
  part(at, new THREE.CylinderGeometry(0.26, 0.28, 0.14, 18), m(color), 0, -0.02, 0);
  part(at, new THREE.BoxGeometry(0.3, 0.03, 0.2), m(brimColor), 0, -0.08, 0.24);
}

function robot(bodyColor, accent) {
  const g = new THREE.Group();
  const metal = m(bodyColor, { metalness: 0.6, roughness: 0.35 });
  for (const s of [-1, 1]) part(g, new THREE.BoxGeometry(0.16, 0.5, 0.16), metal, s * 0.16, 0.28, 0);
  part(g, new THREE.BoxGeometry(0.62, 0.62, 0.42), metal, 0, 0.88, 0);
  part(g, new THREE.BoxGeometry(0.48, 0.38, 0.4), metal, 0, 1.45, 0);
  part(g, new THREE.BoxGeometry(0.36, 0.2, 0.02), glow(accent, 1.2), 0, 1.47, 0.21);
  for (const s of [-1, 1]) part(g, new THREE.BoxGeometry(0.12, 0.45, 0.12), metal, s * 0.42, 0.86, 0);
  part(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), metal, 0, 1.78, 0);
  part(g, new THREE.SphereGeometry(0.05, 8, 6), glow(accent, 2), 0, 1.95, 0);
  const hand = new THREE.Group();
  hand.position.set(0.45, 0.62, 0.15);
  g.add(hand);
  return { g, hand };
}

export function buildRoleModel(roleId, accentHex = '#ffffff') {
  const accent = new THREE.Color(accentHex).getHex();
  let root;
  const anim = {};
  switch (roleId) {
    case 'comms': {
      const p = person({ outfit: 0x24406e, skin: SKINS[1] });
      part(p.hatAt, new THREE.TorusGeometry(0.29, 0.025, 6, 18, Math.PI), m(0x222222), 0, -0.22, 0);
      part(p.g, new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), m(0x222222), 0.2, 1.48, 0.2, [0.9, 0, 0.6]);
      part(p.hand, new THREE.BoxGeometry(0.14, 0.24, 0.08), m(0x333333), 0, 0, 0);
      part(p.hand, new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4), m(0xaaaaaa), 0.04, 0.22, 0);
      part(p.hand, new THREE.SphereGeometry(0.03, 6, 5), glow(0xff3b5c), 0.04, 0.35, 0);
      part(p.g, new THREE.BoxGeometry(0.2, 0.06, 0.05), m(accent), 0, 1.15, 0.28);
      root = p.g;
      break;
    }
    case 'archivist': {
      const p = person({ outfit: 0x6b4a2b, skin: SKINS[0] });
      for (const s of [-1, 1]) part(p.g, new THREE.TorusGeometry(0.07, 0.012, 6, 14), m(0x111111), s * 0.1, 1.58, 0.26);
      part(p.g, new THREE.BoxGeometry(0.42, 0.3, 0.08), m(0x9b1c31), 0, 0.92, 0.36, [0.3, 0, 0]);
      part(p.g, new THREE.BoxGeometry(0.4, 0.28, 0.02), m(0xf5ecd0), 0, 0.93, 0.41, [0.3, 0, 0]);
      part(p.hatAt, new THREE.SphereGeometry(0.2, 10, 8), m(0xdddddd), 0, -0.05, -0.05, null, [1.2, 0.5, 1]);
      part(p.g, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), m(accent), 0, 1.3, 0);
      root = p.g;
      break;
    }
    case 'security': {
      const p = person({ outfit: 0x1f2a44, skin: SKINS[2] });
      capHat(p.hatAt, 0x101826, 0x101826);
      part(p.hatAt, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 6), m(0xffcc33, { metalness: 0.8 }), 0, 0.03, 0.25, [Math.PI / 2, 0, 0]);
      part(p.g, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), m(0xffcc33, { metalness: 0.8 }), -0.15, 1.1, 0.29, [Math.PI / 2, 0, 0]);
      part(p.hand, new THREE.CylinderGeometry(0.04, 0.05, 0.3, 10), m(0x222222), 0, 0, 0.1, [Math.PI / 2, 0, 0]);
      part(p.hand, new THREE.ConeGeometry(0.4, 1.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0.95, [-Math.PI / 2, 0, 0]);
      part(p.g, new THREE.BoxGeometry(0.62, 0.06, 0.1), m(accent), 0, 0.72, 0.25);
      root = p.g;
      break;
    }
    case 'navigator': {
      const p = person({ outfit: 0x176b6b, skin: SKINS[3] });
      part(p.hatAt, new THREE.SphereGeometry(0.27, 14, 8), m(0xb3243c), 0.04, -0.04, 0, [0, 0, -0.2], [1, 0.35, 1]);
      part(p.hand, new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12), m(0xf5ecd0), 0, 0.05, 0.05, [0, 0, Math.PI / 2]);
      part(p.g, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), m(0xffcc33, { metalness: 0.7 }), -0.12, 1.08, 0.29, [Math.PI / 2, 0, 0]);
      part(p.g, new THREE.TorusGeometry(0.32, 0.04, 6, 18), m(accent), 0, 1.25, 0, [Math.PI / 2, 0, 0]);
      root = p.g;
      break;
    }
    case 'engineer': {
      const p = person({ outfit: 0xe07b1a, pants: 0x3a4a6b, skin: SKINS[0] });
      part(p.hatAt, new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(0xffd23f), 0, -0.1, 0);
      part(p.hatAt, new THREE.CylinderGeometry(0.36, 0.36, 0.03, 18), m(0xffd23f), 0, -0.1, 0.03);
      part(p.hand, new THREE.BoxGeometry(0.07, 0.55, 0.05), m(0x9aa4b8, { metalness: 0.8, roughness: 0.3 }), 0, 0.2, 0);
      part(p.hand, new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI * 1.5), m(0x9aa4b8, { metalness: 0.8, roughness: 0.3 }), 0, 0.52, 0);
      part(p.g, new THREE.BoxGeometry(0.3, 0.2, 0.05), m(accent), 0, 0.85, 0.29);
      root = p.g;
      break;
    }
    case 'scanner': {
      const p = person({ outfit: 0x4b2f86, skin: SKINS[4] });
      for (const s of [-1, 1]) part(p.g, new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), glow(0x6cf0ff, 1), s * 0.1, 1.62, 0.24, [Math.PI / 2, 0, 0]);
      part(p.hand, new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), m(0xdddddd), 0, 0.25, 0);
      part(p.hand, new THREE.SphereGeometry(0.09, 12, 10), glow(0x6cf0ff, 2.5), 0, 0.58, 0);
      part(p.g, new THREE.CapsuleGeometry(0.31, 0.2, 4, 12), m(accent, { transparent: true, opacity: 0.6 }), 0, 0.8, 0);
      root = p.g;
      break;
    }
    case 'coroner': {
      const p = person({ outfit: 0x161616, pants: 0x0c0c0c, skin: 0xd8d4c8 });
      part(p.hatAt, new THREE.CylinderGeometry(0.35, 0.35, 0.03, 18), m(0x111111), 0, -0.05, 0);
      part(p.hatAt, new THREE.CylinderGeometry(0.2, 0.2, 0.45, 18), m(0x111111), 0, 0.18, 0);
      part(p.hatAt, new THREE.CylinderGeometry(0.205, 0.205, 0.06, 18), m(accent), 0, 0.0, 0);
      part(p.hand, new THREE.BoxGeometry(0.16, 0.22, 0.16), glow(0x7dffb0, 1.3), 0, 0, 0);
      part(p.g, new THREE.ConeGeometry(0.42, 0.8, 16, 1, true), m(0x161616, { side: THREE.DoubleSide }), 0, 0.55, 0);
      root = p.g;
      break;
    }
    case 'medic': {
      const p = person({ outfit: 0xf2f2f2, pants: 0xdfe6ee, skin: SKINS[1] });
      part(p.g, new THREE.BoxGeometry(0.22, 0.06, 0.03), m(0xe0233a), 0, 1.08, 0.3);
      part(p.g, new THREE.BoxGeometry(0.06, 0.22, 0.03), m(0xe0233a), 0, 1.08, 0.3);
      part(p.hatAt, new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), m(0xdddddd, { metalness: 0.9, roughness: 0.1 }), 0, -0.12, 0.26, [Math.PI / 2, 0, 0]);
      part(p.hand, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), m(0xbfefff, { transparent: true, opacity: 0.7 }), 0, 0.1, 0);
      part(p.hand, new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), m(0xcccccc), 0, 0.31, 0);
      part(p.g, new THREE.TorusGeometry(0.16, 0.025, 6, 16), m(accent), 0, 1.25, 0.12, [0.4, 0, 0]);
      root = p.g;
      break;
    }
    case 'blackbox': {
      const r = robot(0xff7a1a, 0xffe14f);
      part(r.g, new THREE.BoxGeometry(0.3, 0.12, 0.02), m(0x111111), 0, 0.98, 0.22);
      part(r.g, new THREE.BoxGeometry(0.62, 0.06, 0.44), m(accent), 0, 1.2, 0);
      root = r.g;
      break;
    }
    case 'sentinel': {
      const p = person({ outfit: 0xa8b2c4, pants: 0x6f7a8f, skin: SKINS[2] });
      p.outfitMat.metalness = 0.7;
      p.outfitMat.roughness = 0.3;
      part(p.hatAt, new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), m(0xa8b2c4, { metalness: 0.8, roughness: 0.25 }), 0, -0.18, 0);
      part(p.hatAt, new THREE.BoxGeometry(0.05, 0.25, 0.4), m(accent), 0, 0.1, 0);
      const shield = part(p.g, new THREE.CylinderGeometry(0.32, 0.32, 0.05, 20), m(0x2b3a66, { metalness: 0.6 }), -0.55, 0.95, 0.15, [Math.PI / 2, 0, 0.1]);
      part(shield, new THREE.ConeGeometry(0.1, 0.4, 3), glow(0xffe14f), 0, 0.04, 0, [Math.PI / 2, 0, 0]);
      root = p.g;
      break;
    }
    case 'gunner': {
      const p = person({ outfit: 0x4f5d2f, pants: 0x2f3a1c, skin: SKINS[3] });
      part(p.hatAt, new THREE.TorusGeometry(0.26, 0.05, 6, 18), m(0xd11f3c), 0, -0.15, 0, [Math.PI / 2, 0, 0]);
      part(p.hand, new THREE.BoxGeometry(0.14, 0.16, 0.55), m(0x333844, { metalness: 0.6 }), 0, 0.05, 0.2);
      part(p.hand, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), glow(accent, 1.5), 0, 0.05, 0.55, [Math.PI / 2, 0, 0]);
      root = p.g;
      break;
    }
    case 'marine': {
      const p = person({ outfit: 0x3c4a2e, pants: 0x2a3420, skin: SKINS[1] });
      part(p.hatAt, new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(0x3c4a2e), 0, -0.14, 0);
      for (const s of [-1, 1]) part(p.g, new THREE.SphereGeometry(0.17, 12, 8), m(0x55663f), s * 0.36, 1.2, 0, null, [1, 0.6, 1]);
      part(p.hand, new THREE.BoxGeometry(0.1, 0.12, 0.7), m(0x222222), 0, 0.1, 0.25);
      part(p.g, new THREE.BoxGeometry(0.5, 0.35, 0.06), m(accent), 0, 1.0, 0.29);
      root = p.g;
      break;
    }
    case 'firstofficer': {
      const p = person({ outfit: 0x1b2a55, skin: SKINS[0] });
      capHat(p.hatAt, 0xf5f5f5, 0x111111);
      part(p.hatAt, new THREE.CylinderGeometry(0.285, 0.285, 0.04, 18), m(0xffcc33, { metalness: 0.8 }), 0, -0.04, 0);
      part(p.g, new THREE.BoxGeometry(0.1, 0.75, 0.03), m(0xffcc33, { metalness: 0.6 }), 0.05, 1.0, 0.29, [0, 0, 0.6]);
      for (let i = 0; i < 3; i++) part(p.g, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), m([accent, 0xff3b5c, 0x6cf0ff][i], { metalness: 0.6 }), -0.18 + i * 0.07, 1.15, 0.29, [Math.PI / 2, 0, 0]);
      root = p.g;
      break;
    }
    case 'droid': {
      const r = robot(0xe8ecf4, 0x6cf0ff);
      part(r.hand, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 18), m(0xc0c8d8, { metalness: 0.8 }), 0, 0.05, 0.1);
      part(r.hand, new THREE.CylinderGeometry(0.06, 0.045, 0.09, 12), m(0xffffff), 0, 0.11, 0.1);
      part(r.g, new THREE.BoxGeometry(0.2, 0.08, 0.02), m(accent), 0, 1.0, 0.22);
      root = r.g;
      break;
    }
    case 'drunk': {
      const p = person({ outfit: 0x8a6f4e, skin: 0xffb3a1 });
      for (let i = 0; i < 6; i++) part(p.hatAt, new THREE.SphereGeometry(0.09, 8, 6), m(0x6b3e1f), Math.cos(i) * 0.15, -0.08 + Math.sin(i * 3) * 0.04, Math.sin(i) * 0.12);
      part(p.g, new THREE.SphereGeometry(0.06, 8, 6), m(0xff3b3b), 0, 1.52, 0.27);
      part(p.hand, new THREE.CylinderGeometry(0.06, 0.07, 0.28, 10), m(0x2f8a3b, { transparent: true, opacity: 0.85 }), 0, 0.12, 0);
      part(p.hand, new THREE.CylinderGeometry(0.02, 0.025, 0.1, 6), m(0x2f8a3b), 0, 0.32, 0);
      part(p.g, new THREE.TorusGeometry(0.28, 0.05, 6, 16), m(accent), 0, 1.3, 0, [Math.PI / 2, 0, 0]);
      anim.wobble = true;
      root = p.g;
      break;
    }
    case 'stowaway': {
      const g = new THREE.Group();
      for (const s of [-1, 1]) part(g, new THREE.CapsuleGeometry(0.1, 0.25, 4, 8), m(0x2b2f3a), s * 0.14, 0.2, 0);
      part(g, new THREE.BoxGeometry(0.8, 0.8, 0.7), m(0xb08a5a), 0, 0.82, 0);
      part(g, new THREE.BoxGeometry(0.5, 0.12, 0.02), m(0x000000), 0, 1.0, 0.36);
      for (const s of [-1, 1]) part(g, new THREE.SphereGeometry(0.045, 8, 6), glow(0xffffff, 0.6), s * 0.1, 1.0, 0.37);
      part(g, new THREE.BoxGeometry(0.82, 0.08, 0.72), m(accent), 0, 0.6, 0);
      part(g, new THREE.BoxGeometry(0.5, 0.05, 0.4), m(0x9c7a4c), -0.2, 1.24, 0, [0, 0, 0.5]);
      root = g;
      break;
    }
    case 'ambassador': {
      const p = person({ outfit: 0x141414, skin: SKINS[2] });
      part(p.g, new THREE.BoxGeometry(0.08, 0.35, 0.03), m(accent), 0, 1.05, 0.3);
      part(p.hand, new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), m(0xcccccc), 0, 0.35, 0);
      part(p.hand, new THREE.PlaneGeometry(0.4, 0.26), m(0xffffff, { side: THREE.DoubleSide }), 0.2, 0.68, 0);
      part(p.hand, new THREE.CircleGeometry(0.06, 12), m(0x3b82f6, { side: THREE.DoubleSide }), 0.2, 0.68, 0.005);
      part(p.hatAt, new THREE.SphereGeometry(0.22, 10, 8), m(0xdddddd), 0, -0.07, -0.04, null, [1.2, 0.4, 1]);
      root = p.g;
      break;
    }
    case 'hacker': {
      const p = person({ outfit: 0x1d1d26, skin: 0xd8c8b8 });
      part(p.g, new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), m(0x1d1d26), 0, 1.58, -0.04);
      for (const s of [-1, 1]) part(p.g, new THREE.BoxGeometry(0.12, 0.05, 0.02), glow(0x39ff6b, 2), s * 0.1, 1.58, 0.27);
      part(p.g, new THREE.BoxGeometry(0.5, 0.03, 0.34), m(0x2b2b33), 0, 0.82, 0.38);
      part(p.g, new THREE.BoxGeometry(0.5, 0.32, 0.02), glow(0x39ff6b, 1.2), 0, 0.98, 0.22, [-0.3, 0, 0]);
      part(p.g, new THREE.BoxGeometry(0.3, 0.06, 0.04), m(accent), 0, 1.25, 0.29);
      root = p.g;
      break;
    }
    case 'mimic': {
      const g = new THREE.Group();
      const suit = m(accent);
      for (const s of [-1, 1]) part(g, new THREE.CapsuleGeometry(0.14, 0.22, 4, 8), suit, s * 0.18, 0.22, 0);
      part(g, new THREE.CapsuleGeometry(0.42, 0.55, 6, 16), suit, 0, 0.78, 0);
      const blob = part(g, new THREE.SphereGeometry(0.42, 18, 14), m(0x8f2cff, { emissive: 0x4a0f80, emissiveIntensity: 0.6 }), 0, 1.45, 0);
      part(g, new THREE.TorusGeometry(0.18, 0.04, 6, 16, Math.PI), m(0xffffff), 0, 1.38, 0.38, [0, 0, Math.PI]);
      for (const s of [-1, 1]) part(g, new THREE.SphereGeometry(0.07, 10, 8), glow(0xffe14f, 2), s * 0.15, 1.55, 0.36);
      part(g, new THREE.CircleGeometry(0.22, 18), m(0xf5f0e6, { side: THREE.DoubleSide }), 0.55, 0.9, 0.2, [0, -0.6, 0]);
      anim.blob = blob;
      root = g;
      break;
    }
    case 'incubator': {
      const p = person({ outfit: 0x2f6b3a, skin: 0x8fdc7a });
      for (let i = 0; i < 9; i++) part(p.g, new THREE.SphereGeometry(0.12 + (i % 3) * 0.03, 10, 8), glow(i % 2 ? 0xff7ad9 : 0xc77dff, 0.9), Math.cos(i * 1.3) * 0.25, 0.75 + (i % 4) * 0.18, -0.38 - (i % 2) * 0.08);
      for (const s of [-1, 1]) part(p.hatAt, new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), m(0x8fdc7a), s * 0.1, 0.0, 0);
      part(p.g, new THREE.TorusGeometry(0.28, 0.04, 6, 16), m(accent), 0, 1.3, 0, [Math.PI / 2, 0, 0]);
      anim.pulse = true;
      root = p.g;
      break;
    }
    case 'smuggler': {
      const p = person({ outfit: 0xb08d57, pants: 0x3a2f20, skin: SKINS[1] });
      part(p.hatAt, new THREE.CylinderGeometry(0.4, 0.4, 0.03, 18), m(0x3a2f20), 0, -0.06, 0);
      part(p.hatAt, new THREE.CylinderGeometry(0.22, 0.25, 0.22, 18), m(0x3a2f20), 0, 0.05, 0);
      part(p.hatAt, new THREE.CylinderGeometry(0.255, 0.255, 0.05, 18), m(accent), 0, -0.02, 0);
      part(p.hand, new THREE.BoxGeometry(0.45, 0.32, 0.12), m(0x6b3e1f), 0, -0.1, 0);
      part(p.g, new THREE.ConeGeometry(0.42, 0.7, 16, 1, true), m(0xb08d57, { side: THREE.DoubleSide }), 0, 0.55, 0);
      root = p.g;
      break;
    }
    case 'parasite':
    default: {
      const g = new THREE.Group();
      const flesh = m(0x5a1a8a, { emissive: 0x2a0050, emissiveIntensity: 0.6, roughness: 0.4 });
      const body = part(g, new THREE.SphereGeometry(0.75, 24, 18), flesh, 0, 1.0, 0, null, [1, 1.15, 1]);
      const eyes = [];
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        const y = 1.15 + Math.sin(i * 2.1) * 0.25;
        const eye = part(g, new THREE.SphereGeometry(0.1 + (i % 3) * 0.03, 10, 8), m(0xffffff, { emissive: 0xffffaa, emissiveIntensity: 0.4 }), Math.sin(a) * 0.68, y, Math.cos(a) * 0.62);
        part(eye, new THREE.SphereGeometry(0.05, 8, 6), m(0x000000), 0, 0, 0.08);
        eyes.push(eye);
      }
      part(g, new THREE.TorusGeometry(0.28, 0.05, 6, 18, Math.PI), m(0xff3b5c, { emissive: 0xff3b5c, emissiveIntensity: 0.8 }), 0, 0.85, 0.66, [0, 0, Math.PI]);
      const tentacles = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const t = new THREE.Group();
        t.position.set(Math.cos(a) * 0.55, 0.45, Math.sin(a) * 0.55);
        t.rotation.y = -a;
        part(t, new THREE.CylinderGeometry(0.03, 0.12, 0.9, 8), flesh, 0.35, -0.2, 0, [0, 0, 1.2]);
        g.add(t);
        tentacles.push(t);
      }
      part(g, new THREE.TorusGeometry(0.8, 0.05, 6, 24), m(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.2, 0, [Math.PI / 2, 0, 0]);
      anim.tentacles = tentacles;
      anim.body = body;
      g.scale.setScalar(1.25);
      root = g;
      break;
    }
  }
  root.userData.anim = anim;
  return root;
}

// Idle animation for revealed characters.
export function animateRoleModel(model, t) {
  const a = model.userData.anim || {};
  if (a.wobble) model.rotation.z = Math.sin(t * 2.2) * 0.18;
  if (a.tentacles) a.tentacles.forEach((ten, i) => (ten.rotation.z = Math.sin(t * 3 + i) * 0.35));
  if (a.body) a.body.scale.set(1 + Math.sin(t * 2) * 0.04, 1.15 + Math.sin(t * 2 + 1) * 0.05, 1 + Math.sin(t * 2) * 0.04);
  if (a.blob) a.blob.scale.set(1 + Math.sin(t * 4) * 0.08, 1 - Math.sin(t * 4) * 0.06, 1);
  if (a.pulse) model.children.forEach((c, i) => c.material?.emissiveIntensity != null && c.material.emissive?.getHex() && (c.material.emissiveIntensity = 0.6 + Math.sin(t * 3 + i) * 0.4));
}
