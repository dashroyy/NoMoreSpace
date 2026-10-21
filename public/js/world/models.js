// Secret character models, only revealed in the end-game cinematic.
// Each player's suit colour is used as an accent so you can still tell who's who.
import * as THREE from 'three';
import { loadModels, cloneSkinned, clipsOf } from './assets.js';
import { buildParasite } from './parasite.js';
import { outlineEach, outlineSkinned } from './outline.js';
import { Avatar } from './avatar.js';
import { buildDemon, buildHusk } from './demons.js';

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
  recruiter: ['rogue_hooded', 1.9], mole: ['ranger', 1.9], blackmailer: ['tiefling', 1.9],
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
  stagehand: ['farmer_b', 1.85], magician: ['driver', 1.9], actor: ['animatronic_normal', 1.9], knifethrower: ['rogue', 1.9],
  // Outbreak
  vaccinator: ['cleric', 1.9], tracer: ['protagonist_b', 1.85], donor: ['helper_a', 1.8], sensor: ['actionfigure', 1.85],
  patientzero: ['monster', 1.9], hypochondriac: ['farmer_a', 1.85], bioterrorist: ['skeleton_mage', 1.9], quack: ['druid', 1.9],
  // the newer roles. The big ones (a second skeleton, "Rig_Large") play the heavies
  quartermaster: ['hoarder', 1.9], diagnostics: ['clanker', 2.4], pathfinder: ['spaceranger_flightmode', 1.85], peacekeeper: ['paladin_with_helmet', 1.95],
  barker: ['orcbrute', 2.5], sniffer: ['werewolf_wolf', 1.8], cupbearer: ['farmer_b', 1.85],
  daredevil: ['barbarian', 2.0], conspiracy: ['druid', 1.9], mime: ['skeleton_minion', 1.9], antibody: ['frostgolem', 2.4],
  mastermind: ['blackknight', 2.4], jammer: ['robot_gtn', 2.4], framer: ['skeleton_warrior', 1.9], pickpocket: ['skeleton_rogue', 1.9], pharmacist: ['monstrosity', 2.4],
  // the fourth wave (see server/roles-wave4.js)
  mentor: ['mage', 1.9], stargazer: ['witch', 1.9], airlocktech: ['robot_gtn_forgotten', 2.4],
  strongman: ['barbarian_large', 2.5], heartthrob: ['protagonist_b', 1.85], showboat: ['animatronic_creepy', 1.9],
  pathologist: ['lorekeeper', 1.9], superspreader: ['farmer_b', 1.85], mutagen: ['skeleton_golem', 2.4],
  blacksmith: ['paladin_with_helmet', 1.95], courtfool: ['clown', 1.9], avenger: ['blackknight', 2.4],
};
// these characters use the bigger skeleton ("Rig_Large"), so they need its own idle animation
const LARGE_RIG = new Set(['blackknight', 'clanker', 'frostgolem', 'monstrosity', 'robot_gtn', 'orcbrute', 'robot_gtn_forgotten', 'barbarian_large', 'skeleton_golem']);

// what a character holds in its right hand, built pointing up from the palm
const ROLE_PROPS = {
  // the fourth wave
  mentor: () => {
    // a thick old book
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.26, 0.34, 0.08), m(0x6b2a1a), 0, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.24, 0.32, 0.085), m(0xf0e6c8), 0.012, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.06, 0.06, 0.09), m(0xffc233, { metalness: 0.8, roughness: 0.3 }), 0, 0.28, 0);
    return g;
  },
  stargazer: () => {
    // a brass telescope
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), m(0xc9a24a, { metalness: 0.85, roughness: 0.25 }), 0, 0.28, 0, [0.4, 0, 0]);
    part(g, new THREE.CircleGeometry(0.048, 12), glow(0x9ad8ff, 1.2), 0, 0.51, 0.1, [-1.17, 0, 0]);
    return g;
  },
  airlocktech: () => {
    // a big orange wrench
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.08, 0.7, 0.04), m(0xff7a1a), 0, 0.35, 0);
    part(g, new THREE.TorusGeometry(0.11, 0.045, 6, 12, Math.PI * 1.4), m(0x9aa4b8, { metalness: 0.8, roughness: 0.3 }), 0, 0.76, 0, [0, 0, -0.5]);
    return g;
  },
  strongman: () => {
    // a kettlebell, hanging from the fist
    const g = new THREE.Group();
    part(g, new THREE.TorusGeometry(0.07, 0.022, 8, 14), m(0x2a2a30), 0, -0.02, 0);
    part(g, new THREE.SphereGeometry(0.15, 14, 12), m(0x14141c, { roughness: 0.4 }), 0, -0.2, 0);
    part(g, new THREE.CircleGeometry(0.06, 12), m(0xe8203a), 0, -0.2, 0.151);
    return g;
  },
  heartthrob: () => {
    // a red rose
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), m(0x2f8a3a), 0, 0.22, 0);
    part(g, new THREE.SphereGeometry(0.07, 10, 8), m(0xd7263d), 0, 0.48, 0, null, [1, 1.2, 1]);
    part(g, new THREE.SphereGeometry(0.05, 6, 4), m(0x2f8a3a), 0.05, 0.25, 0, null, [1.4, 0.4, 0.8]);
    return g;
  },
  showboat: () => {
    // a microphone
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.03, 0.025, 0.3, 10), m(0x14141c), 0, 0.15, 0);
    part(g, new THREE.SphereGeometry(0.075, 12, 10), m(0xc9cfd8, { metalness: 0.9, roughness: 0.3 }), 0, 0.35, 0);
    return g;
  },
  pathologist: () => {
    // a magnifying glass
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), m(0x5a3a1a), 0, 0.15, 0);
    part(g, new THREE.TorusGeometry(0.11, 0.022, 8, 20), m(0xc9a24a, { metalness: 0.85, roughness: 0.25 }), 0, 0.41, 0);
    part(g, new THREE.CircleGeometry(0.1, 16), m(0xcfe9ff, { transparent: true, opacity: 0.5 }), 0, 0.41, 0);
    return g;
  },
  superspreader: () => {
    // a crumpled hanky
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.12, 8, 6), m(0xf4f4f0, { flatShading: true }), 0, 0.1, 0, [0.5, 0.3, 0.2], [1, 0.7, 0.9]);
    return g;
  },
  mutagen: () => {
    // a bubbling green flask
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.13, 14, 12), m(0xcfe9ff, { transparent: true, opacity: 0.5 }), 0, 0.15, 0);
    part(g, new THREE.SphereGeometry(0.11, 12, 10), glow(0x7dff3a, 1.4), 0, 0.13, 0);
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), m(0xcfe9ff, { transparent: true, opacity: 0.5 }), 0, 0.32, 0);
    return g;
  },
  blacksmith: () => {
    // a smith's hammer
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8), m(0x6b4a2a), 0, 0.27, 0);
    part(g, new THREE.BoxGeometry(0.26, 0.12, 0.12), m(0x3a3a44, { metalness: 0.8, roughness: 0.35 }), 0, 0.58, 0);
    return g;
  },
  avenger: () => {
    // a black sword
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.06, 0.75, 0.015), m(0x2a2a36, { metalness: 0.9, roughness: 0.2 }), 0, 0.5, 0);
    part(g, new THREE.BoxGeometry(0.22, 0.04, 0.04), m(0xb0102a), 0, 0.12, 0);
    part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), m(0x14141c), 0, 0.05, 0);
    return g;
  },
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
  // ---- the newer roles
  quartermaster: () => {
    const g = new THREE.Group();
    part(g, new THREE.TorusGeometry(0.09, 0.015, 6, 16), m(0xb8860b, { metalness: 0.8, roughness: 0.3 }), 0, 0.12, 0);
    for (const [x, rz] of [[0.0, 0.2], [0.07, -0.3]]) {
      part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), m(0xd9b441, { metalness: 0.8 }), x, -0.02, 0, [0, 0, rz]);
      part(g, new THREE.BoxGeometry(0.07, 0.04, 0.012), m(0xd9b441, { metalness: 0.8 }), x + 0.04, -0.12, 0);
    }
    return g;
  },
  diagnostics: () => ROLE_PROPS.engineer(),
  pathfinder: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.075, 0.075, 0.2, 12), m(0xffd27a, { transparent: true, opacity: 0.6, emissive: 0xffa21a, emissiveIntensity: 0.9 }), 0, 0.16, 0);
    for (const y of [0.05, 0.27]) part(g, new THREE.CylinderGeometry(0.085, 0.085, 0.025, 12), m(0x2a2a30, { metalness: 0.7 }), 0, y, 0);
    part(g, new THREE.TorusGeometry(0.06, 0.01, 5, 12, Math.PI), m(0x2a2a30, { metalness: 0.7 }), 0, 0.29, 0);
    part(g, new THREE.SphereGeometry(0.035, 8, 6), glow(0xffe08a, 2.2), 0, 0.16, 0);
    return g;
  },
  peacekeeper: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.012, 0.016, 0.5, 6), m(0x5a3a1a), 0, 0.22, 0);
    for (let i = 0; i < 6; i++) part(g, new THREE.SphereGeometry(0.04, 8, 6), m(0x7bd13a, { emissive: 0x2f7a14, emissiveIntensity: 0.4 }), (i % 2 ? 1 : -1) * 0.05, 0.1 + i * 0.07, 0, [0, 0, (i % 2 ? 1 : -1) * 0.6], [1.7, 0.7, 0.7]);
    return g;
  },
  barker: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.15, 0.05, 0.28, 14, 1, true), m(0xe8203a, { side: THREE.DoubleSide }), 0, 0.28, 0);
    part(g, new THREE.TorusGeometry(0.15, 0.015, 6, 16), m(0xffffff), 0, 0.42, 0, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), m(0x1a1a22), 0, 0.08, 0);
    return g;
  },
  cupbearer: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), m(0xd9b441, { metalness: 0.85, roughness: 0.25 }), 0, 0.07, 0);
    part(g, new THREE.CylinderGeometry(0.075, 0.035, 0.12, 14), m(0xd9b441, { metalness: 0.85, roughness: 0.25 }), 0, 0.19, 0);
    part(g, new THREE.CylinderGeometry(0.065, 0.065, 0.01, 14), glow(0xb01030, 0.9), 0, 0.245, 0);
    part(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), m(0xd9b441, { metalness: 0.85 }), 0, 0.01, 0);
    return g;
  },
  daredevil: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10), m(0xe8203a), 0, 0.2, 0);
    part(g, new THREE.ConeGeometry(0.04, 0.12, 10), m(0xffffff), 0, 0.41, 0);
    for (const a of [0, 2.1, 4.2]) part(g, new THREE.BoxGeometry(0.02, 0.1, 0.07), m(0x1a1a22), Math.cos(a) * 0.05, 0.08, Math.sin(a) * 0.05, [0, -a, 0]);
    part(g, new THREE.SphereGeometry(0.03, 8, 6), glow(0xffa21a, 2.5), 0, 0.03, 0);
    return g;
  },
  conspiracy: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.34, 0.26, 0.03), m(0xb98a52), 0, 0.17, 0);
    part(g, new THREE.BoxGeometry(0.36, 0.28, 0.02), m(0x5a3a1a), 0, 0.17, -0.01);
    for (const [x, y] of [[-0.09, 0.22], [0.08, 0.2], [0, 0.1]]) part(g, new THREE.BoxGeometry(0.07, 0.07, 0.015), m(0xf5f2e6), x, y, 0.02, [0, 0, x * 3]);
    part(g, new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), glow(0xff3b5c, 0.9), -0.005, 0.18, 0.03, [0, 0, 1.2]);
    part(g, new THREE.CylinderGeometry(0.004, 0.004, 0.15, 4), glow(0xff3b5c, 0.9), 0.04, 0.15, 0.03, [0, 0, 0.3]);
    return g;
  },
  mastermind: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.07, 0.09, 0.05, 14), m(0x2a1a4a, { metalness: 0.5, roughness: 0.3 }), 0, 0.03, 0);
    part(g, new THREE.CylinderGeometry(0.03, 0.065, 0.2, 12), m(0x2a1a4a, { metalness: 0.5, roughness: 0.3 }), 0, 0.15, 0);
    part(g, new THREE.SphereGeometry(0.055, 12, 10), m(0x2a1a4a, { metalness: 0.5, roughness: 0.3 }), 0, 0.3, 0);
    part(g, new THREE.BoxGeometry(0.018, 0.09, 0.018), glow(0xffcc4d, 1.2), 0, 0.4, 0);
    part(g, new THREE.BoxGeometry(0.07, 0.018, 0.018), glow(0xffcc4d, 1.2), 0, 0.4, 0);
    return g;
  },
  framer: () => {
    const g = new THREE.Group();
    for (const [w, h, x, y] of [[0.3, 0.03, 0, 0.3], [0.3, 0.03, 0, 0.04], [0.03, 0.29, -0.135, 0.17], [0.03, 0.29, 0.135, 0.17]]) part(g, new THREE.BoxGeometry(w, h, 0.04), m(0xd9b441, { metalness: 0.85, roughness: 0.3 }), x, y, 0);
    part(g, new THREE.BoxGeometry(0.24, 0.24, 0.01), m(0x1d2233), 0, 0.17, -0.01);
    part(g, new THREE.SphereGeometry(0.045, 10, 8), glow(0xff3b5c, 0.9), 0, 0.2, 0.0, null, [1, 1.15, 0.3]);
    return g;
  },
  pickpocket: () => {
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.1, 12, 10), m(0x7a5a33), 0, 0.1, 0, null, [1, 0.9, 1]);
    part(g, new THREE.CylinderGeometry(0.03, 0.05, 0.05, 10), m(0x7a5a33), 0, 0.2, 0);
    part(g, new THREE.TorusGeometry(0.035, 0.008, 5, 10), m(0xd9b441, { metalness: 0.8 }), 0, 0.23, 0, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12), glow(0xffd24a, 0.9), 0.07, 0.04, 0.06, [Math.PI / 2.5, 0, 0]);
    return g;
  },
  pharmacist: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), m(0xff9a1a, { transparent: true, opacity: 0.8 }), 0, 0.1, 0);
    part(g, new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), m(0xffffff), 0, 0.21, 0);
    part(g, new THREE.BoxGeometry(0.075, 0.07, 0.01), m(0xf5f2e6), 0, 0.1, 0.055, null, [1, 1, 1]);
    part(g, new THREE.SphereGeometry(0.018, 6, 5), m(0xffffff), -0.02, 0.05, 0.0);
    part(g, new THREE.SphereGeometry(0.018, 6, 5), m(0xff3b5c), 0.02, 0.09, 0.0);
    return g;
  },
  // ---- and a few for the older roles that had nothing to hold
  archivist: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.26, 0.34, 0.07), m(0x7a2f3a), 0, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.235, 0.32, 0.055), m(0xf5ecd0), 0.01, 0.2, 0.002);
    part(g, new THREE.BoxGeometry(0.1, 0.012, 0.012), glow(0xffd27a, 0.9), 0, 0.28, 0.037);
    return g;
  },
  navigator: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.11, 0.11, 0.035, 20), m(0xb8860b, { metalness: 0.8, roughness: 0.3 }), 0, 0.14, 0, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.095, 0.095, 0.04, 20), m(0xf5f2e6), 0, 0.14, 0.003, [Math.PI / 2, 0, 0]);
    part(g, new THREE.BoxGeometry(0.014, 0.17, 0.01), glow(0xff3b5c, 1.1), 0, 0.14, 0.024, [0, 0, 0.5]);
    return g;
  },
  blackbox: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.22, 0.14, 0.14), m(0xff6a1a), 0, 0.1, 0);
    for (const x of [-0.06, 0.06]) part(g, new THREE.BoxGeometry(0.03, 0.145, 0.145), m(0xffffff), x, 0.1, 0);
    part(g, new THREE.SphereGeometry(0.022, 8, 6), glow(0x6cf0ff, 2.2), 0, 0.2, 0);
    return g;
  },
  droid: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.17, 0.17, 0.018, 20), m(0xc9d3e6, { metalness: 0.85, roughness: 0.25 }), 0, 0.05, 0);
    part(g, new THREE.SphereGeometry(0.07, 12, 10), m(0xffffff), -0.06, 0.13, 0);
    part(g, new THREE.CylinderGeometry(0.01, 0.014, 0.06, 6), m(0xffffff), -0.13, 0.13, 0, [0, 0, 1.0]);
    part(g, new THREE.CylinderGeometry(0.04, 0.03, 0.05, 10), m(0xffffff), 0.08, 0.085, 0.04);
    return g;
  },
  tickettaker: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16), m(0xe8203a), 0, 0.1, 0);
    part(g, new THREE.CylinderGeometry(0.092, 0.092, 0.03, 16), m(0xffffff), 0, 0.1, 0);
    for (const [x, z, r] of [[0.1, 0.02, 0.4], [0.12, -0.04, 0.9]]) part(g, new THREE.BoxGeometry(0.11, 0.003, 0.06), m(0xffe14f), x, 0.12, z, [0, r, 0]);
    return g;
  },
  actor: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), m(0x5a3a1a), 0, 0.12, 0);
    part(g, new THREE.SphereGeometry(0.11, 14, 10), m(0xf5f2e6), 0, 0.33, 0.01, null, [1, 1.15, 0.45]);
    for (const x of [-0.04, 0.04]) part(g, new THREE.SphereGeometry(0.018, 6, 5), m(0x14141c), x, 0.36, 0.06, null, [1, 1.3, 0.5]);
    part(g, new THREE.TorusGeometry(0.04, 0.008, 5, 12, Math.PI), m(0x14141c), 0, 0.3, 0.06, [0, 0, Math.PI]);
    return g;
  },
  knifethrower: () => {
    const g = new THREE.Group();
    for (const r of [-0.35, 0, 0.35]) {
      const k = new THREE.Group();
      part(k, new THREE.BoxGeometry(0.03, 0.2, 0.008), m(0xe9eef2, { metalness: 0.9, roughness: 0.2 }), 0, 0.2, 0);
      part(k, new THREE.BoxGeometry(0.07, 0.015, 0.02), m(0x2a2a30), 0, 0.1, 0);
      part(k, new THREE.CylinderGeometry(0.014, 0.014, 0.09, 6), m(0x5a3a1a), 0, 0.04, 0);
      k.rotation.z = r;
      g.add(k);
    }
    return g;
  },
  donor: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.14, 0.2, 0.035), m(0xe8203a, { transparent: true, opacity: 0.85, emissive: 0x7a0f1a, emissiveIntensity: 0.6 }), 0, 0.2, 0);
    part(g, new THREE.BoxGeometry(0.05, 0.02, 0.04), m(0xffffff), 0, 0.31, 0);
    part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), m(0xcfe9ff, { transparent: true, opacity: 0.6 }), 0.02, 0.06, 0);
    return g;
  },
  sensor: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.13, 0.2, 0.04), m(0x2b2f3a), 0, 0.14, 0);
    part(g, new THREE.PlaneGeometry(0.1, 0.1), glow(0x7dff3a, 1.4), 0, 0.17, 0.022);
    part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.15, 5), m(0xaaaaaa), 0.05, 0.3, 0);
    part(g, new THREE.SphereGeometry(0.018, 6, 5), glow(0xff3b5c, 2), 0.05, 0.38, 0);
    return g;
  },
  hypochondriac: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), m(0xcfe9ff, { transparent: true, opacity: 0.7 }), 0, 0.2, 0);
    part(g, new THREE.SphereGeometry(0.024, 8, 6), glow(0xff3b5c, 1.4), 0, 0.06, 0);
    part(g, new THREE.BoxGeometry(0.1, 0.07, 0.08), m(0xf5f2e6), 0.1, 0.07, 0);
    return g;
  },
  bioterrorist: () => {
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.09, 14, 10), m(0x7dff3a, { transparent: true, opacity: 0.75, emissive: 0x2fa81a, emissiveIntensity: 1.1 }), 0, 0.1, 0);
    part(g, new THREE.CylinderGeometry(0.03, 0.04, 0.08, 10), m(0xd8e8f0, { transparent: true, opacity: 0.7 }), 0, 0.22, 0);
    part(g, new THREE.CylinderGeometry(0.034, 0.034, 0.03, 8), m(0x7a5a33), 0, 0.28, 0);
    return g;
  },
  seer: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.06, 0.08, 0.03, 12), m(0x4a2a14), 0, 0.02, 0);
    part(g, new THREE.SphereGeometry(0.1, 16, 12), m(0xb36bff, { transparent: true, opacity: 0.8, emissive: 0x7a3aff, emissiveIntensity: 1.2 }), 0, 0.14, 0);
    part(g, new THREE.SphereGeometry(0.035, 8, 6), glow(0xffffff, 2), 0.02, 0.15, 0.03);
    return g;
  },
  daggerbearer: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.04, 0.26, 0.01), m(0xe9eef2, { metalness: 0.9, roughness: 0.2 }), 0, 0.23, 0);
    part(g, new THREE.BoxGeometry(0.11, 0.02, 0.03), m(0xd9b441, { metalness: 0.8 }), 0, 0.1, 0);
    part(g, new THREE.CylinderGeometry(0.016, 0.016, 0.1, 6), m(0x5a3a1a), 0, 0.04, 0);
    part(g, new THREE.SphereGeometry(0.028, 8, 6), glow(0xff3b5c, 1.4), 0, -0.01, 0);
    return g;
  },
  recruiter: () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.2, 0.13, 0.015), m(0x14141c), 0, 0.14, 0);
    part(g, new THREE.BoxGeometry(0.2, 0.002, 0.016), m(0x2a2a36), 0, 0.17, 0);
    part(g, new THREE.CylinderGeometry(0.027, 0.027, 0.01, 12), glow(0xb01030, 1.1), 0, 0.15, 0.011, [Math.PI / 2, 0, 0]);
    return g;
  },
};
const characterId = (file) => `characters/${file}`;

// what a character wears on its head: built with the brim at the bottom and the head's width as 1, so they fit any character
const ROLE_HEADS = {
  courtfool: () => {
    // a jester's cap: three floppy points with bells
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.52, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(0x7a2a8a), 0, 0, 0, null, [1, 0.7, 1]);
    [[-1, 0xe8203a], [0, 0xffd23f], [1, 0x2f8a3a]].forEach(([k, c]) => {
      const tip = new THREE.Group();
      tip.position.set(k * 0.24, 0.22, 0);
      tip.rotation.z = -k * 1.0;
      part(tip, new THREE.ConeGeometry(0.12, 0.42, 10), m(c), 0, 0.21, 0);
      part(tip, new THREE.SphereGeometry(0.055, 10, 8), m(0xffc233, { metalness: 0.8, roughness: 0.3 }), 0, 0.44, 0);
      g.add(tip);
    });
    g.userData.sink = 0.15;
    return g;
  },
  magician: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.7, 0.7, 0.04, 20), m(0x14141c), 0, 0.02, 0);
    part(g, new THREE.CylinderGeometry(0.42, 0.46, 0.6, 20), m(0x14141c), 0, 0.34, 0);
    part(g, new THREE.CylinderGeometry(0.465, 0.465, 0.1, 20), m(0xb01030), 0, 0.1, 0);
    return g;
  },
  mime: () => {
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.58, 18, 10), m(0x14141c), 0.08, 0.06, 0, [0, 0, -0.18], [1, 0.4, 1]);
    part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), m(0x14141c), 0.1, 0.27, 0);
    return g;
  },
  conspiracy: () => {
    const g = new THREE.Group();
    part(g, new THREE.ConeGeometry(0.42, 0.7, 9), m(0xdfe6ee, { metalness: 0.95, roughness: 0.15 }), 0, 0.35, 0);
    for (let i = 0; i < 5; i++) part(g, new THREE.BoxGeometry(0.04, 0.04, 0.2), m(0xffffff, { metalness: 0.95, roughness: 0.2 }), Math.cos(i * 1.3) * 0.25, 0.12 + i * 0.11, Math.sin(i * 1.3) * 0.25, [i, i * 2, 0]);
    g.userData.sink = 0.5; // down between the antlers
    return g;
  },
  barker: () => {
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.75, 0.75, 0.04, 20), m(0xf0dfa8), 0, 0.02, 0);
    part(g, new THREE.CylinderGeometry(0.46, 0.5, 0.28, 20), m(0xf0dfa8), 0, 0.18, 0);
    part(g, new THREE.CylinderGeometry(0.505, 0.505, 0.08, 20), m(0xe8203a), 0, 0.09, 0);
    g.userData.sink = 0.3;
    return g;
  },
  daredevil: () => {
    const g = new THREE.Group();
    part(g, new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(0xe8203a), 0, 0, 0);
    part(g, new THREE.BoxGeometry(0.16, 0.05, 1.2), m(0xffffff), 0, 0.58, 0);
    part(g, new THREE.TorusGeometry(0.5, 0.05, 6, 20), m(0x2a2a30), 0, 0.08, 0, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), m(0x9ad8ff, { transparent: true, opacity: 0.7 }), -0.22, 0.14, 0.5, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), m(0x9ad8ff, { transparent: true, opacity: 0.7 }), 0.22, 0.14, 0.5, [Math.PI / 2, 0, 0]);
    g.userData.sink = 0.38;
    return g;
  },
};
const PROP_SCALE = 1.5; // the props were drawn for small hands: these characters are chunky
const CHARACTER_OUTLINE = 0.022; // width of the dark cartoon outline, in the same units as the characters' height
// the Citadel's roles: its characters are fetched while the game is played (the other scripts fetch theirs at the reveal)
export const CITADEL_ROLES = ['seer', 'daggerbearer', 'guardian', 'loyalist', 'recruiter', 'mole', 'blackmailer', 'recruit', 'headtraitor'];
const animsFor = (file) => characterId(LARGE_RIG.has(file) ? 'anims_large' : 'anims');
export const preloadCharacters = (roleIds = Object.keys(KAYKIT)) => {
  const files = [...new Set(roleIds.filter((r) => KAYKIT[r]).map((r) => KAYKIT[r][0]))];
  return loadModels([...files.map(characterId), ...new Set([characterId('anims'), ...files.filter((f) => LARGE_RIG.has(f)).map(animsFor)])]);
};

// put a hat on a character: on top of its head, at the right size, standing upright
function crown(character, hat) {
  // bring every matrix up to date from the very top (a character that arrives from the cache can land before the
  // first frame has been drawn, and a stale parent would put the hat in the wrong place)
  let top0 = character;
  while (top0.parent) top0 = top0.parent;
  top0.updateMatrixWorld(true);
  const head = character.getObjectByName('head');
  if (!head) return;
  let skull = null;
  character.traverse((o) => o.isMesh && /_Head$/.test(o.name) && (skull = o));
  const box = new THREE.Box3().setFromObject(skull || character);
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  // (the smaller of width and depth, so antlers and horns do not make the head look wider than it is)
  const width = skull ? Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 1.2 : (box.max.y - box.min.y) * 0.3;
  top.y -= width * (hat.userData.sink ?? 0.14); // a hat sits down over the hair a little (more for characters with antlers or tall hair)
  const scale = new THREE.Vector3();
  head.getWorldScale(scale);
  hat.scale.setScalar(width / Math.max(0.0001, scale.x));
  hat.position.copy(head.worldToLocal(top));
  hat.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert()); // upright in the world, whatever way the bone points
  head.add(hat);
}

// What each pose plays. The big characters (Rig_Large) have fewer clips: they flex to cheer or taunt.
const POSE_CLIPS = {
  medium: { idle: 'Idle_A', cheer: 'Cheering', taunt: 'Skeletons_Taunt', wave: 'Waving', die: 'Death_A', hit: 'Hit_B' },
  large: { idle: 'Idle_A', cheer: 'Flexing', taunt: 'Flexing', wave: 'Idle_B', die: 'Death_A', hit: 'Hit_A' },
};
const POSES_ONCE = new Set(['die', 'hit']);

function setupPoses(anim, character, file) {
  const names = POSE_CLIPS[LARGE_RIG.has(file) ? 'large' : 'medium'];
  const clips = clipsOf(animsFor(file));
  anim.mixer = new THREE.AnimationMixer(character);
  anim.actions = {};
  for (const [pose, name] of Object.entries(names)) {
    const clip = THREE.AnimationClip.findByName(clips, name);
    if (clip) anim.actions[pose] = anim.mixer.clipAction(clip);
  }
  // a hit is a flinch: back to the idle loop afterwards
  anim.mixer.addEventListener('finished', (e) => {
    if (anim.pose === 'hit' && e.action === anim.actions.hit) anim.play('idle');
  });
  anim.play = (pose) => {
    const next = anim.actions[pose];
    if (!next) return false;
    const prev = anim.pose && anim.actions[anim.pose];
    next.reset();
    next.setLoop(POSES_ONCE.has(pose) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = pose === 'die';
    next.fadeIn(0.25).play();
    if (prev && prev !== next) prev.fadeOut(0.25);
    anim.pose = pose;
    return true;
  };
}

// Ask a revealed character to strike a pose: 'idle', 'cheer', 'taunt', 'wave', 'die' or 'hit'.
// Returns true for the real animated characters (a character still loading plays the pose as soon as it arrives);
// the characters built from shapes return false, and the caller makes them hop about instead.
export function poseRole(model, pose) {
  const anim = model?.userData?.anim;
  if (!anim?.isCharacter) return false;
  anim.wantPose = pose;
  anim.play?.(pose);
  return true;
}

function buildCharacter(roleId, accent) {
  const [file, height] = KAYKIT[roleId];
  const g = new THREE.Group();
  // a ring in the player's suit colour at their feet, so you can still tell who is who
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 28), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const anim = { isCharacter: true };
  g.userData.anim = anim;
  Promise.all([cloneSkinned(characterId(file)), loadModels([animsFor(file)])]).then(([character]) => {
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
    if (ROLE_HEADS[roleId]) crown(character, ROLE_HEADS[roleId]());
    setupPoses(anim, character, file);
    anim.play(anim.wantPose || 'idle');
    if (!anim.wantPose && anim.actions.idle) anim.actions.idle.time = Math.random() * anim.actions.idle.getClip().duration; // not all in step
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
    case 'cuckoo': {
      // a big speckled bird in a nest of twigs, with hungry yellow eyes
      const g = new THREE.Group();
      const feather = m(0x6a8fa8, { roughness: 0.7 });
      const body = part(g, new THREE.SphereGeometry(0.62, 22, 18), feather, 0, 1.0, 0, null, [1, 1.2, 1]);
      part(g, new THREE.SphereGeometry(0.46, 18, 14), m(0xf0e8d0), 0, 0.9, 0.34, null, [1, 1.3, 0.55]);
      for (let i = 0; i < 4; i++) part(g, new THREE.TorusGeometry(0.4 - i * 0.04, 0.012, 5, 22, Math.PI), m(0x3a4a5a), 0, 0.62 + i * 0.17, 0.4 - i * 0.02, [0.15, 0, Math.PI]);
      // the head: a hooked beak, two big eyes and a ragged crest
      part(g, new THREE.SphereGeometry(0.34, 18, 14), feather, 0, 1.78, 0.1);
      part(g, new THREE.ConeGeometry(0.13, 0.4, 10), m(0xffc233), 0, 1.72, 0.48, [Math.PI / 2, 0, 0]);
      part(g, new THREE.ConeGeometry(0.08, 0.14, 8), m(0xe8a21a), 0, 1.65, 0.62, [Math.PI / 2 + 0.7, 0, 0]);
      for (const side of [-1, 1]) {
        part(g, new THREE.SphereGeometry(0.1, 12, 10), m(0xfff3a0, { emissive: 0xffc233, emissiveIntensity: 0.9 }), side * 0.17, 1.86, 0.36);
        part(g, new THREE.SphereGeometry(0.045, 8, 6), m(0x14141c), side * 0.17, 1.86, 0.45);
      }
      for (let i = 0; i < 5; i++) part(g, new THREE.ConeGeometry(0.06, 0.28, 6), feather, (i - 2) * 0.1, 2.12, 0.02, [-0.3, 0, (i - 2) * 0.28]);
      // wings that flap, a fan of tail feathers, two little legs
      const wings = [];
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        w.position.set(side * 0.55, 1.1, -0.05);
        part(w, new THREE.SphereGeometry(0.5, 14, 10), m(0x587a92), side * 0.36, -0.12, 0, [0, 0, side * 0.35], [1.2, 0.3, 0.8]);
        for (let k = 0; k < 3; k++) part(w, new THREE.SphereGeometry(0.2, 8, 6), m(0x3a4a5a), side * (0.62 + k * 0.16), -0.28 - k * 0.04, -0.04, [0, 0, side * 0.5], [1.5, 0.25, 0.8]);
        g.add(w);
        wings.push(w);
        part(g, new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6), m(0xe8a21a), side * 0.2, 0.3, 0.1);
        part(g, new THREE.BoxGeometry(0.16, 0.03, 0.22), m(0xe8a21a), side * 0.2, 0.15, 0.17);
      }
      for (let i = 0; i < 3; i++) part(g, new THREE.ConeGeometry(0.1, 0.55, 6), m(0x3a4a5a), (i - 1) * 0.16, 0.85, -0.7, [-1.1, 0, (i - 1) * 0.3]);
      // the nest, with an egg that is not its own
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5), m(i % 2 ? 0x6b4a2a : 0x8a6234), Math.cos(a) * 0.72, 0.1 + (i % 3) * 0.05, Math.sin(a) * 0.72, [Math.PI / 2, 0, a + 1.2]);
      }
      part(g, new THREE.TorusGeometry(0.78, 0.05, 6, 28), m(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.06, 0, [Math.PI / 2, 0, 0]);
      const egg = part(g, new THREE.SphereGeometry(0.17, 12, 10), m(0xe8f2ff, { emissive: 0x8fb8ff, emissiveIntensity: 0.5 }), 0.9, 0.22, 0.35, null, [1, 1.3, 1]);
      for (let i = 0; i < 5; i++) part(g, new THREE.SphereGeometry(0.026, 6, 5), m(0x3a4a5a), 0.9 + Math.cos(i * 2) * 0.1, 0.22 + Math.sin(i * 3) * 0.12, 0.35 + Math.sin(i * 2) * 0.1);
      anim.flap = wings;
      anim.body = body;
      anim.bob = egg;
      g.scale.setScalar(0.85);
      root = g;
      break;
    }
    // ---------------- the newer Demons (see demons.js) ----------------
    case 'singularity':
    case 'leech':
    case 'fireeater':
    case 'jackpot':
    case 'mould':
    case 'count':
    case 'poisoner':
      root = buildDemon(roleId, accentHex, anim);
      break;
    case 'husk':
      root = buildHusk(suited, accentHex, anim);
      break;
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
  if (a.bob) a.bob.position.y = 0.22 + Math.sin(t * 3) * 0.025;
  if (a.pulse) model.children.forEach((c, i) => c.material?.emissiveIntensity != null && c.material.emissive?.getHex() && (c.material.emissiveIntensity = 0.6 + Math.sin(t * 3 + i) * 0.4));
}
