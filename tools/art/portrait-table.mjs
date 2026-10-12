// The art on every Phase to Space card: one portrait per card, drawn from the asset packs (Kenney's Cube Pets and
// the KayKit characters, all CC0). The card id is the file name: public/assets/phase/art/<id>.webp.
//
//   node tools/art/build-portraits.mjs      writes tools/art/portraits.json
//   node tools/art/serve.mjs                then open http://localhost:3055/art/icons.html?spec=/art/portraits.json&sep=1&size=192&save=1

import { ICONS } from './icon-table.mjs';

// a card that is an object, not a creature: the same picture as its icon, just drawn bigger
const FROM = (icon, o = {}) => {
  const { emoji, ...spec } = ICONS[icon];
  return { ...spec, ...o };
};

const PET = (animal, o = {}) => ({ src: `K:Cube Pets/animal-${animal}`, yaw: -24, pitch: 12, margin: 1.12, ...o });
const HERO = (pack, model, o = {}) => ({ src: `KK:${pack}/${model}`, yaw: -14, pitch: 6, crop: [0.0, 0.46], margin: 1.04, ...o });
const ADV = (m, o) => HERO('KayKit Adventurers 2.0', m, o);
const M4 = (m, o) => HERO('KayKit Mystery Monthly Series 4 (1.1)', m, o);
const M5 = (m, o) => HERO('KayKit Mystery Monthly Series 5 (1.1)', m, o);
const M6 = (m, o) => HERO('KayKit Mystery Monthly Series 6 (1.1)', m, o);
const SK = (m, o) => HERO('KayKit Skeletons 1.1', m, o);
const BODY = (pack, m, o = {}) => ({ src: `KK:${pack}/${m}`, yaw: -24, pitch: 10, margin: 1.1, ...o }); // a whole creature, not a bust
const TD = (m, o = {}) => ({ src: `K:Tower Defense Kit/${m}`, yaw: -24, pitch: 20, margin: 1.1, ...o });

export const PORTRAITS = {
  // ---- Marines
  slab: PET('polar'),
  rampage: M6('ToySoldier'),
  betty: PET('tiger'),
  hank: PET('fish'),
  gizmo: PET('beaver'),
  jaws: PET('crab'),
  // ---- Wardens
  ellie: PET('elephant'),
  bulwark: M4('Robot_One'),
  moth: PET('bee'),
  quill: ADV('Engineer'),
  barnaby: PET('hog'),
  sprocket: M4('Paladin'),
  // ---- Scouts
  bullseye: ADV('Ranger'),
  pug: PET('dog'),
  rae: PET('deer'),
  wanda: PET('parrot'),
  racc: PET('fox'),
  nibble: PET('bunny'),
  // ---- Smugglers
  whiskers: PET('cat'),
  pete: PET('pig'),
  dodgy: M4('Clown'),
  larceny: ADV('Rogue_Hooded'),
  shrimp: M4('Ninja'),
  nyx: SK('Skeleton_Minion'),
  // ---- Psions
  mindwave: M5('Witch'),
  zorp: { src: '2d:/kenney/2D assets/Alien UFO Pack/PNG/shipGreen_manned.png', fill: 0.98 },
  pondering: M6('PlantWarrior'),
  glow: PET('koala'),
  cassie: M6('Cleric'),
  quark: M4('Animatronic_Creepy'),
  // ---- Broadcasters
  tootie: PET('chick'),
  wobble: PET('penguin'),
  hippo: PET('panda'),
  lemur: PET('monkey'),
  alpaca: PET('giraffe'),
  karaoke: PET('lion'),

  // ---- Captains
  rex: ADV('Barbarian'),
  brick: M5('BlackKnight'),
  aurelia: ADV('Knight'),
  obi: M4('Survivalist'),
  juno: M6('Marksman'),
  pip: M5('Hiker'),
  mara: ADV('Rogue'),
  silas: M5('Vampire'),
  zephyra: M6('Lorekeeper'),
  xan: SK('Necromancer'),
  cosmo: M6('AvianSwordsman'),
  dolly: M6('MagicalGirl'),

  // ---- Void Beasts
  slug: PET('caterpillar', { tint: '#8fe8b0' }),
  gloop: BODY('KayKit Mystery Monthly Series 4 (1.1)', 'Monster'),
  gnasher: HERO('KayKit Mystery Monthly Series 6 (1.1)', 'Monstrosity', { crop: [0.0, 0.4] }),
  wraith: HERO('KayKit Skeletons 1.1', 'Skeleton_Mage', { crop: [0.0, 0.42], tint: '#7fe9ff', glow: 0.9 }),
  ripper: HERO('KayKit Mystery Monthly Series 5 (1.1)', 'CombatMech', { crop: [0.0, 0.5] }),
  kraken: { src: 'parasite', center: [0, 1.0, 0.3], span: 3.2, pitch: 8, hemi: 3, key: 3.4 },
  scorpion: PET('crab', { tint: '#ffb347', glow: 0.35 }),
  hound: HERO('KayKit Mystery Monthly Series 4 (1.1)', 'Werewolf_Wolf', { crop: [0.0, 0.4] }),
  bhmoth: PET('bee', { tint: '#8a64d6', glow: 0.3 }),
  siren: TD('enemy-ufo-a-weapon'),
  whale: PET('fish', { tint: '#4a7bff' }),
  dragon: PET('caterpillar', { tint: '#b48cff', glow: 0.25 }),
  queen: PET('bee', { tint: '#ffe066', glow: 0.3 }),
  serpent: HERO('KayKit Skeletons 1.1', 'Skeleton_Golem', { crop: [0.0, 0.42], tint: '#6cf0ff', glow: 0.5 }),
  eater: { src: '2d:/kenney/2D assets/Planets/Planets/planet05.png', fill: 0.98 },

  // ---- Gear
  blaster: FROM('blaster'),
  cell: FROM('battery'),
  plate: FROM('shield'),
  jetpack: FROM('rocket'),
  clover: FROM('clover'),
  rations: FROM('can'),
  anchor: FROM('anchor'),
  collar: FROM('speakerOff'),
  bomb: FROM('bomb'),
  // ---- Protocols
  strike: FROM('comet'),
  salvage: FROM('recycle'),
  overclock: FROM('bolt'),
  gravwell: FROM('cyclone'),
  mindcontrol: FROM('brain'),
  phaseout: FROM('ghostFace'),
  swap: FROM('repeat'),
  supply: FROM('package'),
  reset: FROM('refresh'),
  intel: FROM('sleuth'),
  jump: FROM('fast'),
  // ---- Boosts and the Signal Jam
  b42: FROM('rocket'),
  b31: FROM('bolt'),
  b33: FROM('cyclone'),
  b22: FROM('wrench'),
  b13: FROM('radio'),
  b24: FROM('invader'),
  b44: FROM('trident'),
  b55: FROM('galaxy'),
  jam: FROM('radio'),
};
