// New roles for every script (scripts.js says which scripts use which). Some are cousins of Blood on the
// Clocktower characters (the tb field), some were made up for this game, and a few only make sense online:
//
//   Pathfinder   follows a player's footsteps through the 3D ship, room by room
//   Mime         cannot speak at all by day (no text chat), but can still react, nominate and vote
//   Signal Jammer  shadow-mutes a player: they talk, they think everyone hears them, nobody does
//   Pickpocket   reads over a player's shoulder: a copy of the night message they were sent
//   Framer       makes a good player look like the Parasite to every scan, check and shot
//
//   Quartermaster  <- Seamstress     Daredevil    <- Tinker       Mastermind  <- Mastermind
//   Diagnostics Tech <- Mathematician Peacekeeper <- Pacifist     The Cuckoo  <- Fang Gu
//   Barker       <- Town Crier
//
// Same fields as roles.js (night: first / other / choose / once / notSelf / order), plus:
//   silent : the role cannot use the text chat while the ship is awake (the Mime)
const EXTRA_ROLES = {
  // ---------------- CREW ----------------
  quartermaster: {
    name: 'Quartermaster', type: 'crew', tb: 'Seamstress', icon: '🗃️', minPlayers: 5, tags: ['info'],
    ability: 'Once per game, at night, choose 2 players: you learn if they are on the same team.',
    night: { first: true, other: true, choose: 2, once: true, order: 35 },
    tips: [
      'You only get one look, so make it count: pick two players whose stories contradict each other.',
      'You learn the team, not the role. "Same team" for two players who both claim something is a great sign for them.',
      'The Stowaway might look evil and the Mimic might look good. A strange answer is not always a lie.',
      'You can wait: choose nobody tonight and save the check for a night you have a real question.',
    ],
    flavor: 'Has counted every spoon, bolt and passenger aboard. Two of the passengers do not match the manifest.',
  },
  diagnostics: {
    name: 'Diagnostics Tech', type: 'crew', tb: 'Mathematician', icon: '🧰', minPlayers: 5, tags: ['info'],
    ability: 'Each night, you learn how many players\' abilities malfunctioned tonight (glitched, infected, or the Space Drunk).',
    night: { first: true, other: true, choose: 0, order: 65 },
    tips: [
      'A "0" means every ability worked: no Hacker is glitching anyone tonight, and the Space Drunk is not in this game.',
      'The Space Drunk always counts, so your number is never zero if one is aboard. Watch for it to change.',
      'A number that jumps up on the night after a new player started claiming info often means a Hacker has picked a target.',
      'If you are glitched yourself, your number is wrong. Check it against a night you trust.',
    ],
    flavor: 'Runs a self-test on the entire crew every night. Reports "mostly fine" far too often.',
  },
  pathfinder: {
    name: 'Pathfinder', type: 'crew', tb: null, icon: '👣', minPlayers: 5, tags: ['info'],
    ability: 'Each night*, choose a player (not yourself): you learn every room they entered today.',
    night: { first: false, other: true, choose: 1, notSelf: true, order: 66 },
    tips: [
      'Only rooms count, not corridors, and only while the ship was being explored. A player who stayed on the bridge shows nothing.',
      'Compare the list with their story. "I was in the Galley all day" is easy to check, and easy to catch.',
      'A Blackout cuts the sensors: rooms entered in the dark are not recorded.',
      'Evil players like to wander. A suspiciously long list is a reason to look closer, not proof.',
      '* You do not wake on the first night (nobody has been anywhere yet).',
    ],
    flavor: 'Never gets lost. Mostly because the ship follows them.',
  },
  peacekeeper: {
    name: 'Peacekeeper', type: 'crew', tb: 'Pacifist', icon: '🤝', minPlayers: 5, tags: ['protect'],
    ability: 'If a good player is airlocked, there is a 1 in 2 chance the airlock jams and they survive.',
    night: null,
    tips: [
      'Whenever an airlocking fails, you learn nothing, but the crew learns a lot: the player was good, and somebody aboard can jam the door.',
      'It works for any good player, including you, the Drifters and the Ambassador.',
      'It does not work on evil players, so a successful airlocking is real evidence.',
      'If you are glitched, the airlock never jams.',
    ],
    flavor: 'Has hung a sign on every hatch: "Please talk it out." The hatches are listening.',
  },
  barker: {
    name: 'Barker', type: 'crew', tb: 'Town Crier', icon: '📣', minPlayers: 5, tags: ['info'],
    ability: 'Each night*, you learn if a Saboteur nominated today.',
    night: { first: false, other: true, choose: 0, order: 67 },
    tips: [
      'Write down who nominated whom. A "yes" narrows the Saboteurs to the people who accused someone today.',
      'It does not matter if the nomination worked. Even a nomination that went nowhere counts.',
      'Encourage everyone to nominate. A day with no nominations tells you nothing.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Has never once said anything quietly. Knows exactly who was shouting the loudest.',
  },
  sniffer: {
    name: 'Sniffer Dog', type: 'crew', tb: null, icon: '🐕', minPlayers: 5, tags: ['info'],
    ability: 'Each night, you learn how many of your 2 living neighbours are infected.',
    night: { first: true, other: true, choose: 0, order: 68 },
    tips: [
      'You read your two nearest living neighbours, just like the Engineer. The Antibody and the Hypochondriac smell sick too.',
      'Sit next to someone you trust and you can find out when they catch the fever.',
      'A good boy. Do not airlock the dog.',
      'If you are infected yourself, your nose is blocked and your number is wrong.',
    ],
    flavor: 'Is being treated like a regular crew member. Thinks this is the best day of their life.',
  },
  cupbearer: {
    name: 'Cupbearer', type: 'crew', tb: null, icon: '🍷', minPlayers: 5, tags: ['info'],
    ability: 'Each night, you learn how many Traitors are among the 3 guests sitting across the Round Table from you.',
    night: { first: true, other: true, choose: 0, order: 69 },
    tips: [
      'Across the table means the guest directly opposite you and the one on each side of them. The dead do not count.',
      'A "0" clears three guests at once. A "3" means the other side of the table is rotten.',
      'The seats shift as guests are banished or murdered, so keep reading every night.',
      'Tell trusted guests which seats you watch. They can then watch the seats you cannot.',
    ],
    flavor: 'Tastes every goblet before the host does. Has noticed that three of them taste of betrayal.',
  },

  // ---------------- DRIFTERS ----------------
  daredevil: {
    name: 'Daredevil', type: 'drifter', tb: 'Tinker', icon: '🎢', minPlayers: 5, tags: [],
    ability: 'You might die at any time.',
    night: null,
    tips: [
      'Each night after the first, there is a small chance something goes wrong and you die. It is not the Parasite, but nobody will know that.',
      'Your death confuses the crew: two deaths in a night looks like a Parasite that kills twice.',
      'Claim early. It is the best way to explain a death before it happens.',
      'You are good. Help the crew, and enjoy the stunts while they last.',
    ],
    flavor: 'Has flown through the rings of three planets, upside down. The fourth is going to be fine.',
  },
  conspiracy: {
    name: 'Conspiracy Theorist', type: 'drifter', tb: null, icon: '📌', minPlayers: 5, tags: [],
    ability: 'Each night, you get a tip about who the Parasite is. The tip is right only 1 time in 3.',
    night: { first: true, other: true, choose: 0, order: 70 },
    tips: [
      'Two tips in three are random. If the same name comes back several nights in a row, that is a better sign than one tip.',
      'The crew should not take your word as proof, and neither should you. Share your tips, but say how unreliable they are.',
      'Evil players may claim to be the Theorist to push the crew toward a wrong name. A real tip is never certain.',
      'You are good. Being wrong a lot is just part of the job.',
    ],
    flavor: 'Has a corkboard with red string covering the whole of the cargo bay. About a third of it is correct.',
  },
  mime: {
    name: 'Mime', type: 'drifter', tb: null, icon: '🤐', minPlayers: 5, tags: [], silent: true,
    ability: 'You cannot speak: no text chat while the ship is awake. You can still use emotes, claim a role, nominate and vote.',
    night: null,
    tips: [
      'You are good, but you cannot argue your case in words. Use your claim, your vote and your reactions, and let friends speak for you.',
      'Silence is not suspicious when everyone knows you are the Mime. Claim it early so nobody mistakes it for a sulk.',
      'You can still hear everything and read every message. A quiet player who sees everything is dangerous.',
      'Once you are dead you can talk again, as a ghost.',
    ],
    flavor: 'Has been trapped in an invisible box since the ship launched. Is not nearly as upset about it as the crew is.',
  },
  antibody: {
    name: 'Antibody', type: 'drifter', tb: null, icon: '🧬', minPlayers: 5, tags: [],
    ability: 'You cannot be infected, but the Contact Tracer, the Sniffer Dog and the Biohazard Sensor see you as infected.',
    night: null,
    tips: [
      'You are immune, which is great, and also the thing that makes you look like the sickest person aboard.',
      'Explain yourself before a Tracer finds you. "I am an Antibody" is a good thing to say out loud.',
      'You make infection counts look higher than they are. The crew has to remember that.',
      'You are good. Spreading nothing, catching nothing.',
    ],
    flavor: 'Walked through the spore cloud for fun. Came out humming.',
  },

  // ---------------- SABOTEURS ----------------
  mastermind: {
    name: 'Mastermind', type: 'saboteur', tb: 'Mastermind', icon: '🧠', minPlayers: 7, tags: [],
    ability: 'If the Parasite is airlocked, the game goes on for one more day: the crew must airlock a Saboteur then, or evil wins.',
    night: null,
    tips: [
      'If the crew airlocks the Parasite, you save the game. Act surprised and let the crew panic.',
      'On the extra day the crew must airlock an evil player. Any good player, or nobody at all, and evil wins. Steer them to the wrong name.',
      'You only work if you are alive and not glitched when the Parasite goes out.',
      'Stay quiet and trusted. The more the crew believes in you, the easier the last day is.',
    ],
    flavor: 'Planned for the black hole. Planned for the Parasite. Planned for you airlocking the Parasite.',
  },
  jammer: {
    name: 'Signal Jammer', type: 'saboteur', tb: null, icon: '📻', minPlayers: 5, tags: [],
    ability: 'Once per game, by day: choose a player. For 75 seconds nobody can read what they say. They are not told.',
    system: { id: 'jam', name: 'Static', icon: '📻', target: 'player', phases: ['roam', 'meeting'], seconds: 75, text: 'Once per game, by day: pick a player. For 75 seconds, everything they type reaches nobody but themselves. They are not told.' },
    night: null,
    tips: [
      'Jam someone just before they make an important accusation. They will talk, and nobody will answer.',
      'A jammed player thinks everyone is ignoring them. If they say "why is nobody replying?" you know it worked.',
      'Jam an info role during the meeting, when everyone is waiting for their news.',
      'A glitched Jammer fires a dud that looks real.',
    ],
    flavor: 'Brought a very small radio aboard. The radio is a little bit bigger on the inside.',
  },
  framer: {
    name: 'Framer', type: 'saboteur', tb: null, icon: '🖼️', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player: until the next night, they look like the Parasite to every scan, check and shot.',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 14 },
    tips: [
      'A Scanner will say your target is the Parasite. A Gunner may even shoot them. Pick someone loud, so the crew believes it.',
      'Frame the player the crew trusts least on their own, so the "proof" confirms what they already suspect.',
      'A framed player who gets airlocked looks like the Parasite to the Coroner too.',
      'If you are glitched, nothing happens.',
    ],
    flavor: 'Has a portrait of everyone aboard. Several of them have been touched up.',
  },
  pickpocket: {
    name: 'Pickpocket', type: 'saboteur', tb: null, icon: '🧤', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player: you get a copy of the message they received tonight (or learn they got none).',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 95 },
    tips: [
      'You read an info role\'s results before they tell the crew, so you can back their story or contradict it.',
      '"They received nothing" tells you they have no night information, which is also a clue.',
      'You see the same text they see, true or false. A message that looks too good might have come from a glitch.',
      'If you are glitched, your pockets are empty.',
    ],
    flavor: 'Can lift a wallet, a keycard or a secret. Always gives the wallet back.',
  },
  pharmacist: {
    name: 'Black-Market Pharmacist', type: 'saboteur', tb: null, icon: '💊', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player: no vaccine works on them tonight, to cure or to shield.',
    night: { first: true, other: true, choose: 1, order: 11 },
    tips: [
      'Pick whoever the Vaccinator is likely to cure. The jab is wasted and nobody knows why.',
      'An infected player you protect from the cure will burst when the night ends. It is a very clean kill.',
      'Mix it up. If the crew sees that cures keep failing, they will start asking who is selling the fakes.',
      'If you are glitched, the vaccines work normally.',
    ],
    flavor: 'Sells "miracle cures" out of a locker in the Medbay. Money back guarantee. Money not available.',
  },

  // ---------------- THE DEMON ----------------
  cuckoo: {
    name: 'The Cuckoo', type: 'parasite', tb: 'Fang Gu', icon: '🪺', minPlayers: 6, tags: [],
    ability: 'Each night*, choose a player: they die. Once per game, if you choose a Drifter, you die instead and THEY become the Cuckoo.',
    system: { id: 'blackout', name: 'Blackout', icon: '🌑', target: 'none', phases: ['roam'], seconds: 45, text: 'Once per game, while exploring: cut the lights for 45 seconds. Name tags, the map, door logs and sensors go dark, and chat names show as ???.' },
    night: { first: false, other: true, choose: 1, order: 45 },
    tips: [
      'Choose a Drifter once and you jump into them. They wake up evil, the crew sees a death, and the Cuckoo is still out there.',
      'A Drifter you hatch into is told they are the Cuckoo and who your Saboteurs are. They are good until the moment they are not.',
      'The jump only happens once. After that, the new Cuckoo kills like a Parasite.',
      'If no Drifter is aboard, you are just a hungry bird with a nasty bite.',
      '* You do not kill on the first night.',
    ],
    flavor: 'Never builds its own nest. Always leaves an egg in somebody else\'s.',
  },
};

module.exports = { EXTRA_ROLES };
