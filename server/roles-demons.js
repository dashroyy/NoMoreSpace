// Two new Demons for every script. Each one borrows a Blood on the Clocktower Demon whose trick makes a loud,
// public moment in an online game (a night where nobody dies, a corpse that will not stay dead, three players
// gambling their lives at dawn), dressed up for its script:
//
//   Black Hole Blues  🌀 The Singularity (Po)       🩸 The Leech (Lleech)
//   Cosmic Carnival   🔥 The Fire Eater (Shabaloth)  🎰 The Jackpot (Al-Hadikhia)
//   Outbreak          🍄 The Mould (No Dashii)        🧟 The Husk (Zombuul)
//   Citadel           🧛 The Count (a vampire's bite) ☠️ The Poisoner (the show's "murder in plain sight")
//
// The rules for each are in engine.js (search for the role's id); scripts.js says how often each one turns up.

const BLACKOUT = { id: 'blackout', name: 'Blackout', icon: '🌑', target: 'none', phases: ['roam'], seconds: 45, text: 'Once per game, while exploring: cut the lights for 45 seconds. Name tags, the map, door logs and sensors go dark, and chat names show as ???.' };
const NO_KILL_FIRST = '* You do not kill on the first night.';

const DEMON_ROLES = {
  // ---------------- Black Hole Blues ----------------
  singularity: {
    name: 'The Singularity', type: 'parasite', tb: 'Po', icon: '🌀', minPlayers: 7, tags: [],
    ability: 'Each night*, choose a player: they die. Or choose YOURSELF to charge up: nobody dies tonight, and next night you choose 3 players.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 1, order: 45 },
    tips: [
      'A quiet night scares the crew more than a death. Charge up, then take three at once.',
      'Charging on the night the crew expects a kill makes everyone wonder who protected whom.',
      'Three deaths in one night can end the game fast. Count the living before you charge.',
      NO_KILL_FIRST,
    ],
    flavor: 'Not hungry tonight. Saving room.',
  },
  leech: {
    name: 'The Leech', type: 'parasite', tb: 'Lleech', icon: '🩸', minPlayers: 7, tags: [],
    ability: 'On the first night, latch onto a player: their ability malfunctions all game. Each night* after, choose a player: they die. While your host lives, you cannot die. If your host dies, so do you.',
    system: BLACKOUT,
    night: { first: true, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'Pick a host the crew will not airlock: a loud, trusted player is perfect.',
      'If the crew airlocks you, you live, but now everyone knows what you are. They will hunt your host.',
      'Never choose your host as a victim: you would die with them.',
      'Your host is not told. Their clues are false, which can make them look like a liar.',
      NO_KILL_FIRST,
    ],
    flavor: 'Found a warm spine in the cryo bay and decided to stay.',
  },

  // ---------------- Cosmic Carnival ----------------
  fireeater: {
    name: 'The Fire Eater', type: 'parasite', tb: 'Shabaloth', icon: '🔥', minPlayers: 7, tags: [],
    ability: 'Each night*, choose 2 players: they die. Sometimes, one of the players you burned the night before is spat back out, alive.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 2, notSelf: true, order: 45 },
    tips: [
      'Two a night is fast. Spread your picks so the crew cannot tell who you fear.',
      'When someone comes back, everyone will ask why. Was it the Magician, or the Fire Eater?',
      'Burn the loud info roles together: one of them might come back, but they will not be trusted.',
      NO_KILL_FIRST,
    ],
    flavor: 'Swallows fire, swords and, lately, the odd acrobat. Not all of them stay down.',
  },
  jackpot: {
    name: 'The Jackpot', type: 'parasite', tb: 'Al-Hadikhia', icon: '🎰', minPlayers: 7, tags: [],
    ability: 'Each night*, choose 3 players. At dawn everyone sees them on the wheel, and each secretly chooses to LIVE or DIE. Those who choose die, die. But if all 3 choose to live, all 3 die.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 3, notSelf: true, order: 45 },
    tips: [
      'Put suspicious players on the wheel with trusted ones: whoever volunteers to die looks very good.',
      'Your Saboteurs on the wheel should choose to live. Then a good player has to sacrifice themselves.',
      'Every spin is a public moment. Watch who argues for whom.',
      NO_KILL_FIRST,
    ],
    flavor: 'Three cherries, three skulls. The house always wins.',
  },

  // ---------------- Outbreak ----------------
  mould: {
    name: 'The Mould', type: 'parasite', tb: 'No Dashii', icon: '🍄', minPlayers: 6, tags: [],
    ability: 'Each night*, choose a player: they die. Your spores reach the nearest Crew player on each side of you: their abilities malfunction.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'The two Crew players nearest you at the table get false clues. Their stories will not add up, so you can point at them.',
      'Kill far away from yourself: your spores already handle your neighbours.',
      'If a neighbour of yours dies, the spores reach the next Crew player along.',
      NO_KILL_FIRST,
    ],
    flavor: 'Started as a fuzzy spot behind the fridge. Now it has opinions.',
  },
  husk: {
    name: 'The Husk', type: 'parasite', tb: 'Zombuul', icon: '🧟', minPlayers: 7, tags: [],
    ability: 'Each night*, if nobody died today, choose a player: they die. The first time you die, you get back up at the next dawn.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'You only kill after a day with no airlocking. Push the crew to hold back, and you feed.',
      'The first time you are airlocked or killed you come back at dawn. Then everyone knows. Play the second life well.',
      'Be the loudest voice for "let us not airlock anyone today".',
      NO_KILL_FIRST,
    ],
    flavor: 'Patient Zero\'s suit, still walking around. The patient is not inside.',
  },

  // ---------------- Citadel of Traitors ----------------
  count: {
    name: 'The Count', type: 'parasite', tb: 'Fang Gu', icon: '🧛', minPlayers: 7, tags: [],
    ability: 'Each night*, choose a guest to murder. Your FIRST bite does not kill: that Faithful rises as a Traitor instead (unless they are a Loyalist, or Shielded).',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'Bite someone the Faithful trust. A Traitor they would never banish is worth more than a body.',
      'The first night with no murder will make the Faithful nervous. Let them argue about who was Shielded.',
      'Your new Traitor learns who you all are. Plan the next banishment together.',
      NO_KILL_FIRST,
    ],
    flavor: 'Never drinks... wine. Owns the east tower, and every shadow in it.',
  },
  poisoner: {
    name: 'The Poisoner', type: 'parasite', tb: 'Murder in plain sight', icon: '☠️', minPlayers: 7, tags: [],
    ability: 'Each night*, poison a guest. They are not told. They drop dead at the end of the next day, unless you are banished first.',
    system: BLACKOUT,
    night: { first: false, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'Nobody dies in the night, so the Faithful have no body to argue about at breakfast. Use the quiet.',
      'Your victim walks around all day. If they find you, they can still take you down with them.',
      'If the Faithful banish YOU that day, your poison fails: the victim lives.',
      NO_KILL_FIRST,
    ],
    flavor: 'Pours every guest a glass of the castle\'s finest. Only one glass is special.',
  },
};

module.exports = { DEMON_ROLES };
