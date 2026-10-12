// Secret character models, only revealed in the end-game cinematic.
// Each player's suit colour is used as an accent so you can still tell who's who.
import * as THREE from 'three';
import { loadModels, cloneSkinned, clipsOf } from './assets.js';
import { buildParasite } from './parasite.js';
import { outlineEach, outlineSkinned } from './outline.js';
import { Avatar } from './avatar.js';

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

// A crew spacesuit: the same little astronaut the players wear (see avatar.js), for the roles that are still suited up
function suited(colorHex, visorHex = '#7cc7ff') {
  const av = new Avatar({ look: { suit: 's', visor: 'v', hat: 'none', pet: 'none' }, name: 'x', suits: { s: colorHex }, visors: { v: visorHex } });
  av.label.removeFromParent(); // no name tag
  av.root.scale.setScalar(1.1);
  return av;
}

// Real animated characters (KayKit Adventurers, Skeletons and Mystery Monthly, CC0) for the Citadel of Traitors'
// roles and for many of the others. They load in the background: until a character arrives, the model is just
// its ring. A few carry a small prop in their right hand (see ROLE_PROPS).
const KAYKIT = {
  // the Citadel of Traitors
  seer: ['mage', 1.9], daggerbearer: ['rogue', 1.9], guardian: ['knight', 1.9], loyalist: ['barbarian', 2.0],
  recruiter: ['rogue_hooded', 1.9], mole: ['ranger', 1.9], blackmailer: ['engineer', 1.8],
  recruit: ['skeleton_minion', 1.9], headtraitor: ['necromancer', 2.4],
  // the crew, drifters and saboteurs of the other scripts
  engineer: ['engineer', 1.8], security: ['spaceranger', 1.8], droid: ['robot_one', 2.0], medic: ['cleric', 1.9], clown: ['clown', 1.9],
  jester: ['animatronic_creepy', 1.9], hexer: ['witch', 1.9], sentinel: ['paladin', 1.95], stowaway: ['survivalist', 1.9], hacker: ['ninja', 1.8],
  sporehost: ['plantwarrior', 2.0], marine: ['toysoldier', 1.8], coroner: ['vampire', 1.9],
  // Black Hole Blues, the rest of the cast
  comms: ['protagonist_a', 1.85], archivist: ['lorekeeper', 1.9], navigator: ['hiker', 1.85], scanner: ['magicalgirl', 1.85],
  blackbox: ['robot_two', 1.9], gunner: ['marksman', 1.9], firstofficer: ['superhero', 1.85], drunk: ['caveman', 1.9],
  ambassador: ['avianswordsman', 1.9], incubator: ['monstercostume', 1.9], smuggler: ['driver', 1.9],
  // Cosmic Carnival
  liontamer: ['werewolf_man', 1.9], acrobat: ['helper_b', 1.8], palmreader: ['tiefling', 1.9], tickettaker: ['farmer_a', 1.85],
  stagehand: ['farmer_b', 1.85], magician: ['mage', 1.9], actor: ['animatronic_normal', 1.9], knifethrower: ['rogue', 1.9],
  // Outbreak
  vaccinator: ['cleric', 1.9], tracer: ['protagonist_b', 1.85], donor: ['helper_a', 1.8], sensor: ['actionfigure', 1.85],
  patientzero: ['monster', 1.9], hypochondriac: ['farmer_a', 1.85], bioterrorist: ['skeleton_mage', 1.9], quack: ['druid', 1.9],
};

// what a character holds in its right hand, built pointing up from the palm
const ROLE_PROPS = {
  medic: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 10), m(0xcfe9ff, { transparent: true, opacity: 0.55 }), 0, 0.25, 0);
    part(g, new THREE.CylinderGeometry(0.036, 0.036, 0.3, 10), glow(0x7dff6b, 1.2), 0, 0.22, 0);
    part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), m(0xdddddd), 0, 0.55, 0);
    part(g, new THREE.CylinderGeometry(0.07, 0.07, 0.015, 10), m(0xdddddd), 0, 0.66, 0);
    part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), m(0xe9eef2, { metalness: 0.9 }), 0, -0.05, 0);
    return g;
  },
  security: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.55, 10), m(0x1a1a22), 0, 0.3, 0);
    part(g, new THREE.CylinderGeometry(0.043, 0.043, 0.08, 10), glow(0xffcc33, 1), 0, 0.5, 0);
    return g;
  },
  hexer: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.018, 0.026, 0.7, 6), m(0x4a2a14), 0, 0.35, 0);
    part(g, new THREE.OctahedronGeometry(0.08), glow(0xb36bff, 2), 0, 0.76, 0);
    return g;
  },
  engineer: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.06, 0.6, 0.03), m(0x9aa4b8, { metalness: 0.8, roughness: 0.3 }), 0, 0.3, 0);
    part(g, new THREE.TorusGeometry(0.09, 0.035, 6, 12, Math.PI * 1.5), m(0x9aa4b8, { metalness: 0.8, roughness: 0.3 }), 0, 0.62, 0);
    return g;
  },
  sentinel: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), m(0x2a2a36, { metalness: 0.6 }), 0, 0.35, 0);
    part(g, new THREE.SphereGeometry(0.08, 10, 8), glow(0xffe14f, 2.4), 0, 0.75, 0);
    part(g, new THREE.TorusGeometry(0.1, 0.012, 6, 16), glow(0xffe14f, 1.4), 0, 0.75, 0, [Math.PI / 2, 0, 0]);
    return g;
  },
  hacker: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.4, 0.025, 0.28), m(0x1c2230, { metalness: 0.6 }), 0, 0.05, 0.1, [-0.2, 0, 0]);
    part(g, new THREE.BoxGeometry(0.4, 0.28, 0.02), m(0x1c2230, { metalness: 0.6 }), 0, 0.2, -0.04, [-0.25, 0, 0]);
    part(g, new THREE.PlaneGeometry(0.34, 0.22), glow(0x6cf0ff, 1.4), 0, 0.2, -0.03, [-0.25, 0, 0]);
    return g;
  },
  stowaway: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.34, 0.3, 0.3), m(0xa8803a), 0, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.36, 0.05, 0.32), m(0x6b4a2a), 0, 0.2, 0);
    return g;
  },
  vaccinator: () => ROLE_PROPS.medic(),
  scanner: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), m(0xdddddd), 0, 0.25, 0);
    part(g, new THREE.SphereGeometry(0.09, 12, 10), glow(0x6cf0ff, 2.5), 0, 0.6, 0);
    part(g, new THREE.TorusGeometry(0.13, 0.012, 6, 18), glow(0x6cf0ff, 1.4), 0, 0.6, 0, [Math.PI / 2, 0, 0]);
    return g;
  },
  drunk: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.06, 0.065, 0.24, 12), m(0x2f8a3b), 0, 0.12, 0);
    part(g, new THREE.CylinderGeometry(0.022, 0.05, 0.1, 10), m(0x2f8a3b), 0, 0.3, 0);
    part(g, new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8), m(0xd9b441), 0, 0.37, 0);
    part(g, new THREE.BoxGeometry(0.1, 0.09, 0.07), m(0xf5ecd0), 0, 0.12, 0.03);
    return g;
  },
  tracer: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.26, 0.36, 0.025), m(0x7a5a33), 0, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.22, 0.3, 0.02), m(0xf5f2e6), 0, 0.2, 0.012);
    part(g, new THREE.BoxGeometry(0.1, 0.03, 0.03), m(0x9aa4b8, { metalness: 0.8 }), 0, 0.38, 0.02);
    return g;
  },
  palmreader: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.08, 0.1, 0.05, 14), m(0x6b4a2b), 0, 0.02, 0);
    part(g, new THREE.SphereGeometry(0.13, 16, 12), glow(0xb36bff, 1.3), 0, 0.17, 0);
    return g;
  },
  ambassador: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), m(0xcccccc), 0, 0.4, 0);
    part(g, new THREE.BoxGeometry(0.4, 0.26, 0.012), m(0xffffff), 0.2, 0.74, 0);
    part(g, new THREE.CylinderGeometry(0.06, 0.06, 0.016, 14), m(0x3b82f6), 0.2, 0.74, 0, [Math.PI / 2, 0, 0]);
    return g;
  },
  liontamer: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.02, 0.025, 0.4, 8), m(0x5a3a1a), 0, 0.15, 0);
    part(g, new THREE.TorusGeometry(0.2, 0.012, 5, 16, Math.PI * 1.3), m(0x2a1a0c), 0.12, 0.5, 0, [0, 0, 0.6]);
    return g;
  },
  quack: () => {
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.11, 14, 10), m(0x7dff6b, { emissive: 0x3aa83a, emissiveIntensity: 0.9 }), 0, 0.11, 0);
    part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), m(0xd8e8f0), 0, 0.27, 0);
    part(g, new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10), m(0xb8860b), 0, 0.36, 0);
    return g;
  },
  comms: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.1, 0.22, 0.06), m(0x2b2f3a), 0, 0.12, 0);
    part(g, new THREE.CylinderGeometry(0.009, 0.009, 0.2, 5), m(0xaaaaaa), 0.035, 0.32, 0);
    part(g, new THREE.SphereGeometry(0.025, 8, 6), glow(0xff3b5c, 2), 0.035, 0.43, 0);
    return g;
  },
  smuggler: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.32, 0.22, 0.1), m(0x5a3a1a), 0, 0.1, 0);
    part(g, new THREE.BoxGeometry(0.06, 0.04, 0.11), m(0xd9b441, { metalness: 0.7 }), 0, 0.12, 0);
    return g;
  },
  magician: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), m(0x111111), 0, 0.22, 0);
    for (const y of [-0.02, 0.48]) part(g, new THREE.CylinderGeometry(0.017, 0.017, 0.07, 6), m(0xffffff), 0, y, 0);
    return g;
  },
  clown: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), m(0xdddddd), 0, 0.35, 0);
    const balloon = part(g, new THREE.SphereGeometry(0.2, 14, 10), glow(0xe8203a, 0.5), 0, 0.9, 0, null, [1, 1.2, 1]);
    balloon.userData.bob = true;
    return g;
  },
};
const characterId = (file) => `characters/${file}`;
const PROP_SCALE = 1.5; // the props were drawn for small hands: these characters are chunky
const CHARACTER_OUTLINE = 0.022; // width of the dark cartoon outline, in the same units as the characters' height
// the Citadel's roles: its characters are fetched while the game is played (the other scripts fetch theirs at the reveal)
export const CITADEL_ROLES = ['seer', 'daggerbearer', 'guardian', 'loyalist', 'recruiter', 'mole', 'blackmailer', 'recruit', 'headtraitor'];
export const preloadCharacters = (roleIds = Object.keys(KAYKIT)) => loadModels([...new Set(roleIds.filter((r) => KAYKIT[r]).map((r) => characterId(KAYKIT[r][0]))), characterId('anims')]);

function buildCharacter(roleId, accent) {
  const [file, height] = KAYKIT[roleId];
  const g = new THREE.Group();
  // a ring in the player's suit colour at their feet, so you can still tell who is who
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 28), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const anim = {};
  g.userData.anim = anim;
  Promise.all([cloneSkinned(characterId(file)), loadModels([characterId('anims')])]).then(([character]) => {
    if (!character) return;
    const box = new THREE.Box3().setFromObject(character);
    const k = height / Math.max(0.1, box.max.y - box.min.y);
    character.scale.setScalar(k);
    character.position.y = -box.min.y * k;
    g.add(character);
    outlineSkinned(character, CHARACTER_OUTLINE);
    const hand = ROLE_PROPS[roleId] && character.getObjectByName('handslotr');
    if (hand) {
      // the hand bone's own x axis points to the floor and its y axis forward: a quarter turn stands the prop up
      const prop = ROLE_PROPS[roleId]();
      prop.rotation.z = Math.PI / 2;
      prop.scale.setScalar(PROP_SCALE);
      hand.add(prop);
    }
    const idle = THREE.AnimationClip.findByName(clipsOf(characterId('anims')), 'Idle_A');
    if (idle) {
      anim.mixer = new THREE.AnimationMixer(character);
      const action = anim.mixer.clipAction(idle);
      action.time = Math.random() * idle.duration; // not all in step
      action.play();
    }
  });
  return g;
}

export function buildRoleModel(roleId, accentHex = '#ffffff') {
  const accent = new THREE.Color(accentHex).getHex();
  if (KAYKIT[roleId]) return buildCharacter(roleId, accent);
  let root;
  const anim = {};
  switch (roleId) {
    case 'mimic': {
      // a stolen spacesuit with something purple bursting out of the helmet
      const av = suited(accentHex);
      av.visor.visible = false; // the glass is gone
      av.body.traverse((o) => o.material === av.glintMat && (o.visible = false));
      av.headMat.color.set(0x8f2cff);
      av.headMat.emissive.set(0x4a0f80);
      av.headMat.emissiveIntensity = 0.6;
      const extra = new THREE.Group();
      const blob = part(extra, new THREE.SphereGeometry(0.44, 22, 18), m(0x8f2cff, { emissive: 0x4a0f80, emissiveIntensity: 0.6 }), 0, 1.78, 0.02, null, [1.05, 0.9, 1.05]);
      part(extra, new THREE.TorusGeometry(0.17, 0.04, 6, 16, Math.PI), m(0xffffff), 0, 1.62, 0.43, [0, 0, Math.PI]); // a grin
      for (const side of [-1, 1]) part(extra, new THREE.SphereGeometry(0.075, 10, 8), glow(0xffe14f, 2), side * 0.17, 1.84, 0.4, null, [1, 1.2, 0.7]); // yellow eyes
      for (let i = 0; i < 5; i++) part(extra, new THREE.TetrahedronGeometry(0.09), m(0xbfe8ff), Math.cos(i * 1.3) * 0.5, 1.4 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.5, [i, i * 2, 0]); // glass shards
      outlineEach(extra, 0.016);
      av.body.add(extra);
      anim.blob = blob;
      anim.suits = [av];
      root = av.root;
      break;
    }
    // ---------------- Cosmic Carnival ----------------
    case 'stagedouble': {
      const a = suited('#e8e8ef');
      const b = suited('#1a1a22', '#141420');
      a.root.position.x = -0.5;
      b.root.position.x = 0.5;
      b.eyeMat.color.set(0xff3b5c); // the double's eyes glow red
      b.eyeMat.emissive.set(0xff3b5c);
      const halo = part(a.root, new THREE.TorusGeometry(0.34, 0.025, 6, 20), m(accent), 0, 2.15, 0, [Math.PI / 2, 0, 0]);
      outlineEach(halo, 0.012);
      const both = new THREE.Group();
      both.add(a.root, b.root);
      anim.suits = [a, b];
      root = both;
      break;
    }
    case 'reflection': {
      const g = new THREE.Group();
      const frame = part(g, new THREE.TorusGeometry(0.62, 0.07, 10, 36), m(0xc9a24a, { metalness: 0.85, roughness: 0.25 }), 0, 1.15, 0, null, [1, 1.4, 1]);
      part(g, new THREE.CircleGeometry(0.58, 32), m(0xbcd4ff, { metalness: 1, roughness: 0.04, emissive: 0x335577, emissiveIntensity: 0.5 }), 0, 1.15, 0.01, null, [1, 1.4, 1]);
      const flesh = m(0x5a1a8a, { emissive: 0x2a0050, emissiveIntensity: 0.6, roughness: 0.4 });
      const tentacles = [];
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Group();
        t.position.set(-0.55 + i * 0.22, 1.9, -0.08);
        part(t, new THREE.CylinderGeometry(0.02, 0.08, 0.7, 8), flesh, 0, 0.2, 0, [0, 0, 0.1 * (i - 2.5)]);
        g.add(t);
        tentacles.push(t);
      }
      for (const s2 of [-1, 1]) part(g, new THREE.SphereGeometry(0.1, 10, 8), glow(0xff3b5c, 2), s2 * 0.2, 1.4, 0.05);
      part(g, new THREE.CylinderGeometry(0.5, 0.6, 0.12, 20), m(0x3a2f20), 0, 0.06, 0);
      part(g, new THREE.TorusGeometry(0.62, 0.03, 6, 28), m(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.14, 0, [Math.PI / 2, 0, 0]);
      anim.tentacles = tentacles;
      g.scale.setScalar(1.1);
      root = g;
      break;
    }
    // ---------------- Citadel of Traitors ----------------
    // ---------------- Outbreak ----------------
    case 'hazmat': {
      const av = suited('#e8c52a', '#cfe9ff');
      const extra = new THREE.Group();
      part(extra, new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), m(0xd7263d), 0, 0.92, -0.54); // a spare oxygen tank
      part(extra, new THREE.CircleGeometry(0.13, 3), m(0x111111), 0, 1.0, 0.305); // the biohazard mark
      part(extra, new THREE.TorusGeometry(0.33, 0.035, 6, 22), m(accent), 0, 1.1, 0, [Math.PI / 2, 0, 0]); // a collar in the player's colour
      outlineEach(extra, 0.014);
      av.body.add(extra);
      anim.suits = [av];
      root = av.root;
      break;
    }
    case 'carrier': {
      const g = new THREE.Group();
      const flesh = m(0x2f8a3a, { emissive: 0x0f4a1a, emissiveIntensity: 0.7, roughness: 0.5 });
      const body = part(g, new THREE.SphereGeometry(0.7, 22, 16), flesh, 0, 1.0, 0, null, [1, 1.15, 1]);
      // glowing spots, and a rim of mould spikes
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4;
        const y = 1.0 + Math.sin(i * 1.7) * 0.5;
        const r = Math.sqrt(0.7 ** 2 - (Math.min(0.69, Math.abs(y - 1.0)) ** 2));
        part(g, new THREE.SphereGeometry(0.07 + (i % 3) * 0.03, 8, 6), glow([0xb8ff3a, 0xffe14f, 0x7dffd8][i % 3], 1.6), Math.sin(a) * r * 0.97, y, Math.cos(a) * r * 0.97);
      }
      const spikes = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const t = new THREE.Group();
        t.position.set(Math.cos(a) * 0.55, 0.45, Math.sin(a) * 0.55);
        t.rotation.y = -a;
        part(t, new THREE.ConeGeometry(0.1, 0.55, 6), glow(0x7dff3a, 0.9), 0.3, -0.1, 0, [0, 0, 1.2]);
        g.add(t);
        spikes.push(t);
      }
      // two big hollow eyes and a mouth that coughs out spores
      for (const s2 of [-1, 1]) {
        part(g, new THREE.SphereGeometry(0.13, 10, 8), m(0xffffff, { emissive: 0xeaffb0, emissiveIntensity: 0.5 }), s2 * 0.25, 1.25, 0.58);
        part(g, new THREE.SphereGeometry(0.05, 8, 6), m(0x000000), s2 * 0.25, 1.25, 0.69);
      }
      part(g, new THREE.TorusGeometry(0.2, 0.05, 6, 16, Math.PI), m(0x1a3a14), 0, 0.82, 0.62, [0, 0, Math.PI]);
      const cloud = new THREE.Group();
      cloud.position.y = 1.2;
      for (let i = 0; i < 10; i++) part(cloud, new THREE.SphereGeometry(0.05, 8, 6), glow(0xb8ff3a, 1.4), Math.cos(i * 0.9) * 0.95, (i % 4) * 0.2 - 0.2, Math.sin(i * 0.9) * 0.95);
      g.add(cloud);
      part(g, new THREE.TorusGeometry(0.8, 0.05, 6, 24), m(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.2, 0, [Math.PI / 2, 0, 0]);
      anim.tentacles = spikes;
      anim.body = body;
      anim.orbit = cloud;
      g.scale.setScalar(1.25);
      root = g;
      break;
    }
    case 'parasite':
    default: {
      // the Parasite unmasked: see parasite.js
      root = buildParasite(accent);
      Object.assign(anim, root.userData.anim);
      anim.noOutline = true; // it is hundreds of pieces already, and bold enough without a line round each one
      break;
    }
  }
  if (!anim.suits && !anim.noOutline) outlineEach(root, 0.016);
  root.userData.anim = anim;
  return root;
}

// Idle animation for revealed characters.
export function animateRoleModel(model, t, camera = null) {
  const a = model.userData.anim || {};
  if (a.wobble) model.rotation.z = Math.sin(t * 2.2) * 0.18;
  if (a.tentacles) a.tentacles.forEach((ten, i) => (ten.rotation.z = Math.sin(t * 3 + i) * 0.35));
  if (a.body) a.body.scale.set(1 + Math.sin(t * 2) * 0.04, 1.15 + Math.sin(t * 2 + 1) * 0.05, 1 + Math.sin(t * 2) * 0.04);
  if (a.tick) a.tick(t, camera, model);
  if (a.suits) {
    const dt = Math.min(0.1, Math.max(0, t - (a.suitT ?? t)));
    a.suitT = t;
    for (const suit of a.suits) suit.update(dt, t);
  }
  if (a.mixer) {
    a.mixer.update(Math.min(0.1, Math.max(0, t - (a.lastT ?? t))));
    a.lastT = t;
  }
  if (a.orbit) a.orbit.rotation.y = t * 1.6;
  if (a.flap) a.flap.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * (0.15 + Math.sin(t * 2.2) * 0.3)));
  if (a.blob) a.blob.scale.set(1 + Math.sin(t * 4) * 0.08, 1 - Math.sin(t * 4) * 0.06, 1);
  if (a.pulse) model.children.forEach((c, i) => c.material?.emissiveIntensity != null && c.material.emissive?.getHex() && (c.material.emissiveIntensity = 0.6 + Math.sin(t * 3 + i) * 0.4));
}
