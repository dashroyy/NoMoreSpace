// Ruler of the Galaxy: everything in the game that is not a rule. The contenders, their evolutions, the
// Xenotech Bazaar cards, the cosmic anomalies and the dice. A dice-chucking brawl for 2-6 players, inspired by
// "King of Tokyo", with its own names and twists.
//
// The story: at the heart of the Andromeda-Milky Way collision sits the Galactic Core, a half-shattered Dyson
// sphere. Whoever docks there broadcasts Dominion across the galaxy, and every rival shoots at them for it.
// First to 20 Dominion Stars (or the last ship flying) rules the galaxy.

// The six faces of a quantum die
const FACES = ['1', '2', '3', 'repair', 'laser', 'shard'];
const FACE_INFO = {
  1: { name: '1', text: 'Three 1s score 1 Dominion Star' },
  2: { name: '2', text: 'Three 2s score 2 Dominion Stars' },
  3: { name: '3', text: 'Three 3s score 3 Dominion Stars' },
  repair: { name: 'Nanite Repair', text: '+1 Hull (not inside the Core). Three of them: an Evolution' },
  laser: { name: 'Laser Strike', text: '1 damage to your targets' },
  shard: { name: 'Dark Matter Shard', text: '+1 Dark Matter, spent in the Bazaar' },
};

// The contenders: everyone plays a different one. A perk works all game; an evolution is earned by rolling
// three Nanite Repairs (you choose one you have not had yet).
// stats (1-5) and difficulty (1 easy - 3 hard) are for the contender select screen only; the rules never read them.
// strike (seconds): how its weapon looks on screen. From starting to charge until the first shot lands, and the gap
// between shots. The game waits that long after a volley so the animation finishes before the damage arrives.
const contender = (id, o) => ({ id, ...o });
const CONTENDERS = [
  contender('mechanova', {
    name: 'Mecha-Nova Prime',
    title: 'The Dyson Vanguard',
    color: '#00f0ff',
    art: '🤖',
    style: 'Tank: built to hold the Core',
    stats: { firepower: 2, armour: 5, economy: 2, control: 3 },
    difficulty: 1,
    strike: { charge: 0.35, flight: 0.22, gap: 0.14 },
    lore: 'A fifty-kilometre combiner dreadnought forged from the hull plates of a hundred fallen fleets.',
    perk: { key: 'aegis', name: 'Aegis Protocol', text: 'Starts with 11 Hull instead of 10.' },
    evolutions: [
      { id: 'thorns', name: 'Thorns of the Core', kind: 'keep', text: 'When you take damage in the Core and choose to hold, deal 1 damage back to the attacker.' },
      { id: 'siege', name: 'Siege Mode Lock', kind: 'keep', text: 'Gain 3 Stars instead of 2 when you start your turn in the Core, but you can only yield at 3 Hull or less.' },
      { id: 'capacitor', name: 'Overcharged Capacitor', kind: 'now', text: 'Gain 1 Dark Matter for every 2 Hull you are missing.' },
    ],
  }),
  contender('kraken', {
    name: 'The Void Kraken',
    title: 'Eldritch Leviathan',
    color: '#b537f2',
    art: '🦑',
    style: 'Aggro: feeds on reactors',
    stats: { firepower: 5, armour: 3, economy: 2, control: 3 },
    difficulty: 2,
    strike: { charge: 0.4, flight: 0.35, gap: 0.15 },
    lore: 'A bioluminescent horror that swims through hyperspace rifts and feeds on starship reactor cores.',
    perk: { key: 'hunger', name: 'Abyssal Hunger', text: 'When you make a rival yield the Core, steal 1 Dark Matter from them.' },
    evolutions: [
      { id: 'grapple', name: 'Hyperspace Grapple', kind: 'keep', text: 'When someone yields the Core to you, you may pay 2 Dark Matter to keep them trapped inside instead.' },
      { id: 'spores', name: 'Void Spores', kind: 'keep', text: 'When you deal 3 or more damage in one turn, everyone you hit also loses 1 Star.' },
      { id: 'leech', name: 'Bio-Leech Tendrils', kind: 'keep', text: 'When you destroy a rival or drop them below 3 Hull, heal 2 (even in the Core).' },
    ],
  }),
  contender('hive', {
    name: 'Cyber-Hive Xenos',
    title: 'The Assimilation Swarm',
    color: '#00ff87',
    art: '🐝',
    style: 'Economy: buys the Bazaar out',
    stats: { firepower: 2, armour: 3, economy: 5, control: 2 },
    difficulty: 2,
    strike: { charge: 0.4, flight: 0.55, gap: 0.1 },
    lore: 'A technorganic insect fleet that strip-mines asteroids and rebuilds its carapace from stolen tech.',
    perk: { key: 'scrap', name: 'Scrap Assimilation', text: 'Flushing the Bazaar costs you 1 Dark Matter instead of 2.' },
    evolutions: [
      { id: 'brood', name: 'Brood Replication', kind: 'keep', text: 'Outside the Core, rolling two or more Repairs heals 1 extra.' },
      { id: 'reverse', name: 'Reverse-Engineered Tech', kind: 'keep', text: 'Augment cards cost you 1 less (at least 1).' },
      { id: 'acid', name: 'Acidic Spore Cloud', kind: 'now', text: 'Deal 2 damage to every rival and gain 3 Dark Matter.' },
    ],
  }),
  contender('stareater', {
    name: 'Solaris Star-Eater',
    title: 'Living Supernova',
    color: '#ffb800',
    art: '☀️',
    style: 'Glass cannon: big bursts',
    stats: { firepower: 5, armour: 1, economy: 4, control: 2 },
    difficulty: 3,
    strike: { charge: 0.55, flight: 0.28, gap: 0.18 },
    lore: 'A plasma elemental in magnetic containment rings. It burns its own stability to throw solar flares.',
    perk: { key: 'fusion', name: 'Fusion Core', text: 'Starts the game with 2 Dark Matter.' },
    evolutions: [
      { id: 'critical', name: 'Critical Mass', kind: 'keep', text: 'Once per turn, while rolling: take 1 damage to turn one die into a Laser or a Shard.' },
      { id: 'prominence', name: 'Solar Prominence', kind: 'keep', text: 'When you roll four or more Lasers, gain 2 Stars.' },
      { id: 'ejection', name: 'Supernova Ejection', kind: 'keep', text: 'When you yield the Core, deal 1 damage to every other player.' },
    ],
  }),
  contender('chronos', {
    name: 'Chronos Syndicate',
    title: 'Temporal Corsairs',
    color: '#38bdf8',
    art: '⏳',
    style: 'Control: bends the dice',
    stats: { firepower: 2, armour: 3, economy: 3, control: 5 },
    difficulty: 3,
    strike: { charge: 0.45, flight: 0.5, gap: 0.12 },
    lore: 'Time pirates in a phase-shifting battlecruiser, powered by a captured naked singularity.',
    perk: { key: 'slip', name: 'Temporal Slip', text: 'One extra roll on your first turn, and again on the first turn after each time you enter the Core.' },
    evolutions: [
      { id: 'paradox', name: 'Paradox Loop', kind: 'keep', text: 'When your dice show a 1, a 2 and a 3, gain 2 Stars and 2 Dark Matter.' },
      { id: 'stasis', name: 'Chrono-Stasis Shield', kind: 'keep', text: 'While you have 2 or more Dark Matter, every hit on you does 1 less damage.' },
      { id: 'rewind', name: 'Time Rewind', kind: 'now', text: 'Heal 3 (even in the Core).' },
    ],
  }),
  contender('goliath', {
    name: 'Goliath Asteroid-Walker',
    title: 'Lithoid Behemoth',
    color: '#f97316',
    art: '🪨',
    style: 'Juggernaut: hard to hurt',
    stats: { firepower: 3, armour: 4, economy: 1, control: 2 },
    difficulty: 1,
    strike: { charge: 0.5, flight: 0.85, gap: 0.2 },
    lore: 'A hollowed-out planetoid on plasma thrusters, with planetary defence lasers welded to its plates.',
    perk: { key: 'tectonic', name: 'Tectonic Mass', text: 'Rivals and cards can never take your Stars away.' },
    evolutions: [
      { id: 'impactors', name: 'Kinetic Impactors', kind: 'keep', text: 'In the Core, rolling three Repairs also deals 2 damage to everyone outside it.' },
      { id: 'magma', name: 'Magma Carapace', kind: 'now', text: '+2 maximum Hull (up to 12), and heal 2.' },
      { id: 'bombard', name: 'Planetary Bombardment', kind: 'now', text: 'Deal 1 damage to every rival for every 3 Stars you have (at least 2).' },
    ],
  }),
];

// The Xenotech Bazaar. "keep" cards (Augments) stay on your ship; "now" cards (Directives) happen once and are
// discarded. A Directive's effect is a list of steps the engine runs; an Augment is a named hook it checks for.
const card = (id, kind, cost, name, art, text, extra = {}) => ({ id, kind, cost, name, art, text, ...extra });
const CARDS = [
  // ---- Augments (keep) ----
  card('overclock', 'keep', 6, 'Quantum Overclock', '🎲', 'Roll 7 dice instead of 6.', { hook: 'extraDie' }),
  card('thrusters', 'keep', 4, 'Temporal Thrusters', '⏩', 'One extra roll every turn.', { hook: 'extraRoll' }),
  card('ablative', 'keep', 4, 'Ablative Plating', '🛡️', 'Ignore any hit of exactly 1 damage.', { hook: 'ablative' }),
  card('railgun', 'keep', 5, 'Orbital Railgun', '🔫', 'When you deal Laser damage, deal 1 more.', { hook: 'railgun' }),
  card('ion', 'keep', 4, 'Ion Overcharge', '⚡', 'When you roll three or more Lasers, deal 1 more.', { hook: 'ion' }),
  card('siphon', 'keep', 4, 'Parasitic Siphon', '🧲', 'When you hit whoever holds the Core, steal 1 Dark Matter from them.', { hook: 'siphon' }),
  card('drones', 'keep', 3, 'Repair Drones', '🛠️', 'When you heal with Repairs, heal 1 more.', { hook: 'drones' }),
  card('sails', 'keep', 2, 'Solar Sails', '⛵', 'End your turn with no Dark Matter: gain 1.', { hook: 'sails' }),
  card('feeder', 'keep', 5, 'Fusion Feeder', '🔋', 'When you roll Shards, gain 1 more.', { hook: 'feeder' }),
  card('cartographer', 'keep', 3, 'Star Cartographer', '🗺️', 'Gain 1 Star each time you buy a card.', { hook: 'cartographer' }),
  card('hoard', 'keep', 5, 'Dark Matter Hoard', '💎', 'End of your turn: 1 Star for every 6 Dark Matter you hold.', { hook: 'hoard' }),
  card('ram', 'keep', 6, 'Plasma Ram', '☄️', 'Deal 1 damage every turn, even with no Lasers.', { hook: 'ram' }),
  card('cloak', 'keep', 6, 'Nebula Cloak', '🌫️', 'Each point of damage you take has a 1 in 6 chance of missing.', { hook: 'cloak' }),
  card('banner', 'keep', 3, 'Warlord Banner', '🚩', 'Gain 1 Star when you deal Laser damage.', { hook: 'banner' }),
  card('echo', 'keep', 4, 'Resonance Chamber', '🔔', 'When you score a triplet, gain 1 more Star.', { hook: 'echo' }),
  card('throne', 'keep', 4, 'Throne Siphon', '👑', 'Gain 1 more Star when you start a turn in the Core or the Pulsar.', { hook: 'throne' }),
  card('salvage', 'keep', 3, 'Salvage Drones', '♻️', 'Gain 3 Dark Matter whenever any ship is destroyed.', { hook: 'salvage' }),
  card('megahull', 'keep', 5, 'Neutronium Bulkheads', '🧱', '+2 maximum Hull, and heal 2.', { hook: 'megahull' }),
  card('bay', 'keep', 3, 'Rapid Repair Bay', '🔧', 'In the Bazaar: pay 2 Dark Matter to heal 1, as often as you like.', { hook: 'bay' }),
  card('freighter', 'keep', 3, 'Smuggler Freighter', '🚚', 'Cards cost you 1 less.', { hook: 'discount' }),
  // ---- Directives (now) ----
  card('relay', 'now', 3, 'Derelict Relay', '📡', 'Gain 1 Star.', { fx: [['stars', 1]] }),
  card('claim', 'now', 4, 'Asteroid Mining Claim', '⛏️', 'Gain 2 Stars.', { fx: [['stars', 2]] }),
  card('shipyard', 'now', 5, 'Abandoned Shipyard', '🏗️', 'Gain 3 Stars.', { fx: [['stars', 3]] }),
  card('fragment', 'now', 6, 'Dyson Fragment', '🔆', 'Gain 4 Stars.', { fx: [['stars', 4]] }),
  card('mercs', 'now', 3, 'Mercenary Squadron', '🛸', 'Gain 2 Stars and take 2 damage.', { fx: [['stars', 2], ['hurtSelf', 2]] }),
  card('kamikaze', 'now', 4, 'Kamikaze Wing', '💥', 'Gain 4 Stars and take 3 damage.', { fx: [['stars', 4], ['hurtSelf', 3]] }),
  card('dread', 'now', 5, 'Dreadnought Contract', '🚀', 'Gain 5 Stars and take 4 damage.', { fx: [['stars', 5], ['hurtSelf', 4]] }),
  card('gamma', 'now', 6, 'Gamma-Ray Burst', '☢️', 'Gain 2 Stars and deal 3 damage to every rival.', { fx: [['stars', 2], ['hurtOthers', 3]] }),
  card('storm', 'now', 3, 'Plasma Storm', '🌩️', 'Deal 2 damage to every rival.', { fx: [['hurtOthers', 2]] }),
  card('reactor', 'now', 6, 'Reactor Salvage', '⚛️', 'Gain 2 Stars and heal 3.', { fx: [['stars', 2], ['heal', 3]] }),
  card('drydock', 'now', 3, 'Emergency Drydock', '🩹', 'Heal 3, even inside the Core.', { fx: [['heal', 3]] }),
  card('drop', 'now', 5, 'Orbital Drop', '🪂', 'Gain 2 Stars and take the Core (whoever holds it goes out).', { fx: [['stars', 2], ['takeCore']] }),
  card('jump', 'now', 3, 'Hyperspace Jump', '🌀', 'Take the Core, no fight needed (whoever holds it goes out).', { fx: [['takeCore']] }),
  card('tempest', 'now', 6, 'Ion Tempest', '🌪️', 'Gain 2 Stars. Every rival loses half their Dark Matter.', { fx: [['stars', 2], ['halveShards']] }),
  card('decree', 'now', 7, 'Galactic Decree', '📜', 'Every rival loses 5 Stars.', { fx: [['othersLoseStars', 5]] }),
  card('overdrive', 'now', 7, 'Overdrive Burst', '🔥', 'Take another turn after this one.', { fx: [['extraTurn']] }),
  card('tap', 'now', 8, 'Dark Matter Tap', '🌌', 'Gain 9 Dark Matter.', { fx: [['shards', 9]] }),
  card('supernova', 'now', 5, 'Supernova', '💫', 'Every ship, yours too, takes 3 damage. Gain 1 Star.', { fx: [['stars', 1], ['hurtAll', 3]] }),
];

// Cosmic anomalies: one arrives every third round and lasts for that round.
const ANOMALIES = [
  { id: 'flare', name: 'Solar Flare', art: '☀️', text: 'Lasers do double damage. Entering the Core gives 3 Stars instead of 1.' },
  { id: 'nebula', name: 'Dark Matter Nebula', art: '🌌', text: 'Roll at least one Shard: gain 1 extra.' },
  { id: 'collapse', name: 'Gravity Collapse', art: '🕳️', text: 'Ships outside the Core that roll no Lasers take 1 damage at the end of their turn.' },
  { id: 'convoy', name: 'Trade Convoy', art: '🚚', text: 'Every card costs 2 less (at least 1).' },
  { id: 'wormhole', name: 'Wormhole Storm', art: '🌀', text: 'Whoever holds the Core and the Pulsar is flung back out to the Rim.' },
  { id: 'summit', name: 'Peace Summit', art: '🕊️', text: 'No Laser damage this round. Stars only.' },
];

// Ghost ships: a destroyed contender keeps playing as a phantom, rolling two ghost dice on their turn.
const GHOST_FACES = ['haunt', 'haunt', 'drain', 'drain', 'blank', 'blank'];

const START_HULL = 10;
const MAX_HULL_CAP = 12;
const TARGETS = [15, 20, 25];

const ALL_IDS = [...CARDS.map((c) => c.id), ...CONTENDERS.map((c) => c.id), ...CONTENDERS.flatMap((c) => c.evolutions.map((e) => e.id)), ...ANOMALIES.map((a) => a.id)];
if (new Set(ALL_IDS).size !== ALL_IDS.length) throw new Error('Ruler of the Galaxy: two things share an id');

const cardDef = (id) => CARDS.find((c) => c.id === id) || null;
const contenderDef = (id) => CONTENDERS.find((c) => c.id === id) || null;
const evolutionDef = (id) => {
  for (const c of CONTENDERS) {
    const e = c.evolutions.find((x) => x.id === id);
    if (e) return { ...e, contender: c.id };
  }
  return null;
};
const anomalyDef = (id) => ANOMALIES.find((a) => a.id === id) || null;

// what the browser needs to draw and explain everything
const CLIENT_DATA = { faces: FACES, faceInfo: FACE_INFO, contenders: CONTENDERS, cards: CARDS, anomalies: ANOMALIES, targets: TARGETS, startHull: START_HULL };

module.exports = { FACES, FACE_INFO, CONTENDERS, CARDS, ANOMALIES, GHOST_FACES, START_HULL, MAX_HULL_CAP, TARGETS, cardDef, contenderDef, evolutionDef, anomalyDef, CLIENT_DATA };
