// Every role in No More Space, plus the setup tables.
//
// The rules mirror Blood on the Clocktower's beginner script "Trouble Brewing"
// one-for-one, re-themed for a ship falling into a black hole:
//   Townsfolk -> Crew        Outsiders -> Drifters
//   Minions   -> Saboteurs   Demon     -> The Parasite
//   Storyteller -> The Captain (or ARIA, the ship's autopilot)
//
// This file is plain data so the browser can show the same role cards.

const TEAMS = { crew: 'crew', infiltrators: 'infiltrators' };

const TYPES = {
  crew: { name: 'Crew', team: 'crew', color: '#6cf0ff', blurb: 'Good. Your ability helps the crew.' },
  drifter: { name: 'Drifter', team: 'crew', color: '#9be36b', blurb: 'Good, but your ability makes life harder for the crew.' },
  saboteur: { name: 'Saboteur', team: 'infiltrators', color: '#ff6b8b', blurb: 'Evil. You serve the Parasite and spread chaos.' },
  parasite: { name: 'Parasite', team: 'infiltrators', color: '#c77dff', blurb: 'Evil. You kill. If you die, evil loses.' },
};

// night: when the role wakes.
//   first / other : true if it wakes on the first night / later nights
//   choose        : how many players it picks (0 = just receives info)
//   notSelf       : cannot pick yourself
//   order         : position in the night (lower acts first), matches Trouble Brewing
// minPlayers: the role is only dealt in games with at least this many players.
const ROLES = {
  // ---------------- CREW (Townsfolk) ----------------
  comms: {
    name: 'Comms Officer', type: 'crew', tb: 'Washerwoman', icon: '📡', minPlayers: 3, tags: ['info'],
    ability: 'You start knowing that 1 of 2 players is a particular Crew role.',
    night: { first: true, other: false, choose: 0, order: 30 },
    tips: [
      'Your info is true (unless you are glitched), so one of the two players really is that role.',
      'Ask both players what they are before you reveal what you know: a liar will often pick the wrong role.',
      'You confirm a good player for the crew early. That is gold in a game full of bluffs.',
    ],
    flavor: 'Picked up a crackling transmission before the black hole swallowed the antenna.',
  },
  archivist: {
    name: 'Archivist', type: 'crew', tb: 'Librarian', icon: '📚', minPlayers: 5, tags: ['info'],
    ability: 'You start knowing that 1 of 2 players is a particular Drifter. (Or that zero are aboard.)',
    night: { first: true, other: false, choose: 0, order: 31 },
    tips: [
      'If you learn "zero Drifters", anyone claiming a Drifter is lying (or very confused).',
      'If you see the Space Drunk, one of those two players thinks they are crew but is not. Their info is fake!',
      'Knowing how many Drifters exist helps spot a Smuggler (it adds 2 extra Drifters).',
    ],
    flavor: 'Keeps the passenger manifest. Every stowaway leaves a paper trail.',
  },
  security: {
    name: 'Security Chief', type: 'crew', tb: 'Investigator', icon: '🛡️', minPlayers: 5, tags: ['info'],
    ability: 'You start knowing that 1 of 2 players is a particular Saboteur.',
    night: { first: true, other: false, choose: 0, order: 32 },
    tips: [
      'One of your two players is evil, so treat both carefully, but do not airlock blindly: the Stowaway can trick you.',
      'Wait for both players to claim a role. The one with the weaker story is often your Saboteur.',
      'Evil players will want you dead early. Consider hiding your info until the right moment.',
    ],
    flavor: 'Reviewed the airlock cameras. Two faces showed up where they should not be.',
  },
  navigator: {
    name: 'Navigator', type: 'crew', tb: 'Chef', icon: '🧭', minPlayers: 5, tags: ['info'],
    ability: 'You start knowing how many pairs of evil players sit next to each other.',
    night: { first: true, other: false, choose: 0, order: 33 },
    tips: [
      'Seats are the chairs around the bridge table. Neighbours wrap around the circle.',
      'A "0" means no two evil players sit side by side. Great for clearing pairs of friends.',
      'Combine with the Engineer: together you can triangulate evil seats.',
    ],
    flavor: 'Plots every course by the stars. Lately the stars have been plotting back.',
  },
  engineer: {
    name: 'Engineer', type: 'crew', tb: 'Empath', icon: '🔧', minPlayers: 4, tags: ['info'],
    ability: 'Each night, you learn how many of your 2 alive neighbours are evil.',
    night: { first: true, other: true, choose: 0, order: 60 },
    tips: [
      'Your neighbours change as players die: you always read the nearest living player on each side.',
      'Track your number every night. A change tells you something about who just died or moved closer.',
      'The Parasite would love to kill you. Staying quiet can keep you alive longer.',
    ],
    flavor: 'Can feel bad wiring through the hull plating. Some of the wiring is people.',
  },
  scanner: {
    name: 'Scanner', type: 'crew', tb: 'Fortune Teller', icon: '🔭', minPlayers: 3, tags: ['info'],
    ability: 'Each night, choose 2 players: you learn if either is the Parasite. There is a good player who has a "ghost signal" and registers as the Parasite to you.',
    night: { first: true, other: true, choose: 2, order: 61 },
    tips: [
      'A "yes" might be the ghost signal, an innocent player who always pings. Scan them again with someone else.',
      'You can scan yourself plus one other player to test a single person.',
      'Scanning two "no" players clears both of being the Parasite (though either could still be a Saboteur).',
    ],
    flavor: 'The scanner was built for asteroids, not people. It is getting better at people.',
  },
  coroner: {
    name: 'Coroner', type: 'crew', tb: 'Undertaker', icon: '⚰️', minPlayers: 3, tags: ['info'],
    ability: 'Each night*, you learn which role was airlocked today.',
    night: { first: false, other: true, choose: 0, order: 55 },
    tips: [
      'You confirm whether the crew airlocked an evil player. Huge for trust!',
      'If someone claimed a role and you see something else, they were lying.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Retrieves what is left after the airlock. Paperwork in triplicate.',
  },
  medic: {
    name: 'Medic', type: 'crew', tb: 'Monk', icon: '💉', minPlayers: 3, tags: ['protect'],
    ability: 'Each night*, choose a player (not yourself): they are safe from the Parasite tonight.',
    night: { first: false, other: true, choose: 1, notSelf: true, order: 40 },
    tips: [
      'Protect players with strong info: the Engineer, Scanner or a confirmed crew member.',
      'If nobody dies at night, you may have saved someone. Do not reveal who too quickly!',
      '* You do not wake on the first night.',
    ],
    flavor: 'Has a bag of antidotes and a very concerned expression.',
  },
  blackbox: {
    name: 'Black Box', type: 'crew', tb: 'Ravenkeeper', icon: '📼', minPlayers: 3, tags: ['info'],
    ability: 'If you die at night, you are woken to choose a player: you learn their role.',
    night: { first: false, other: false, choose: 1, order: 50, onDeath: true },
    tips: [
      'If the Parasite kills you, your last act is a free role check. Pick someone suspicious, or someone you need cleared.',
      'You can claim openly to scare the Parasite away from killing you... or to bait it.',
    ],
    flavor: 'Records everything. Survives everything. Mostly.',
  },
  sentinel: {
    name: 'Sentinel', type: 'crew', tb: 'Virgin', icon: '⚡', minPlayers: 5, tags: ['action'],
    ability: 'The 1st time you are nominated, if the nominator is a Crew role, they are airlocked immediately.',
    night: null,
    tips: [
      'If a nominator gets zapped, they are confirmed Crew and you are confirmed Sentinel.',
      'If nobody gets zapped, your nominator might be evil... or a Drifter.',
      'Ask a trusted player to nominate you early to prove yourself.',
    ],
    flavor: 'Wired into the ship defences. Point a finger at them and the floor points back.',
  },
  gunner: {
    name: 'Gunner', type: 'crew', tb: 'Slayer', icon: '🔫', minPlayers: 5, tags: ['action'],
    ability: 'Once per game, during the day, publicly choose a player: if they are the Parasite, they die.',
    night: null,
    tips: [
      'You only get one shot. Wait until you are fairly sure, or use it to test a strong suspect.',
      'A Stowaway might register as the Parasite and die to your shot. Unlucky!',
      'Evil players may falsely claim Gunner to look innocent. A real shot proves nothing unless it hits.',
    ],
    flavor: 'One charge left in the plasma pistol. Make it count.',
  },
  marine: {
    name: 'Marine', type: 'crew', tb: 'Soldier', icon: '🪖', minPlayers: 5, tags: ['protect'],
    ability: 'You are safe from the Parasite.',
    night: null,
    tips: [
      'The Parasite cannot kill you at night, so you can say risky things.',
      'Claiming Marine may make you a target for a Hacker (a glitched Marine CAN be killed).',
    ],
    flavor: 'Armoured, stubborn and frankly a bit indigestible.',
  },
  firstofficer: {
    name: 'First Officer', type: 'crew', tb: 'Mayor', icon: '🎖️', minPlayers: 5, tags: ['protect'],
    ability: 'If only 3 players live & no airlocking occurs, your team wins. If you die at night, another player might die instead.',
    night: null,
    tips: [
      'With 3 players left, convince everyone NOT to airlock anyone. If you are alive and not glitched, the crew wins.',
      'The Parasite may "miss" you at night and someone else dies instead.',
      'Evil will try to claim First Officer late in the game. Be ready to prove yourself.',
    ],
    flavor: 'Second in command. First to volunteer others.',
  },

  // ---------------- DRIFTERS (Outsiders) ----------------
  droid: {
    name: 'Service Droid', type: 'drifter', tb: 'Butler', icon: '🤖', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 70 },
    tips: [
      'Pick a master who votes a lot, or one you trust.',
      'If your master has not raised their hand when the vote reaches you, your vote will not count.',
      'You are good! Help the crew find the Parasite even though you cannot vote freely.',
    ],
    flavor: 'Beep boop. Would you like some tea while we fall into the singularity?',
  },
  drunk: {
    name: 'Space Drunk', type: 'drifter', tb: 'Drunk', icon: '🍾', minPlayers: 5, tags: [],
    ability: 'You do not know you are the Space Drunk. You think you are a Crew role, but you are not.',
    night: null,
    tips: [
      'You will never see this card during the game. You will believe you are a Crew role.',
      'Your information may be wrong and your "ability" does nothing.',
    ],
    flavor: 'Found the Andromeda moonshine before launch. Has not been sober since.',
  },
  stowaway: {
    name: 'Stowaway', type: 'drifter', tb: 'Recluse', icon: '📦', minPlayers: 5, tags: [],
    ability: 'You might register as evil & as a Saboteur or the Parasite, even if dead.',
    night: null,
    tips: [
      'Scanners, Engineers and the Gunner might see you as evil. Explain early that you are the Stowaway.',
      'You are good. Help the crew, but expect suspicion.',
    ],
    flavor: 'Snuck aboard in a cargo crate. Smells faintly of hamster.',
  },
  ambassador: {
    name: 'Ambassador', type: 'drifter', tb: 'Saint', icon: '🕊️', minPlayers: 5, tags: [],
    ability: 'If you are airlocked, your team loses.',
    night: null,
    tips: [
      'Never let the crew airlock you. Claim early if you are being nominated.',
      'Evil players may also claim Ambassador to avoid the airlock. Have a way to prove yourself.',
    ],
    flavor: 'A diplomatic incident waiting to happen.',
  },

  // ---------------- SABOTEURS (Minions) ----------------
  hacker: {
    name: 'Hacker', type: 'saboteur', tb: 'Poisoner', icon: '💻', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player: their systems are glitched tonight and tomorrow day.',
    night: { first: true, other: true, choose: 1, order: 10 },
    tips: [
      'Glitch info roles to feed them false results, or glitch the Medic so the Parasite can strike.',
      'A glitched Gunner, Sentinel or First Officer does nothing.',
      'Bluff a Crew role that is NOT in play (ask the Parasite for its bluffs).',
    ],
    flavor: 'Rewrote the medbay firmware to play elevator music forever.',
  },
  mimic: {
    name: 'Mimic', type: 'saboteur', tb: 'Spy', icon: '🎭', minPlayers: 5, tags: [],
    ability: 'Each night, you see the Ship Manifest. You might register as good & as a Crew or Drifter role, even if dead.',
    night: { first: true, other: true, choose: 0, order: 80 },
    tips: [
      'You can see every role. Use it to make perfect bluffs and to tell the Parasite who to kill.',
      'You may register as good to Scanners and Engineers, so you can claim almost anything.',
      'Do not over-share what you know. Knowing too much makes the crew suspicious.',
    ],
    flavor: 'Wears faces like other people wear hats.',
  },
  incubator: {
    name: 'Incubator', type: 'saboteur', tb: 'Scarlet Woman', icon: '🥚', minPlayers: 5, tags: [],
    ability: 'If there are 5 or more players alive & the Parasite dies, you become the Parasite.',
    night: null,
    tips: [
      'If the crew airlocks the Parasite early, you secretly take over. Act surprised!',
      'Stay unsuspicious. You are the evil team\'s backup plan.',
    ],
    flavor: 'Carries the next generation. Several hundred of them.',
  },
  smuggler: {
    name: 'Smuggler', type: 'saboteur', tb: 'Baron', icon: '🧳', minPlayers: 7, tags: [],
    ability: 'There are extra Drifters aboard. [+2 Drifters]',
    night: null,
    tips: [
      'Your ability already worked: 2 Crew roles were swapped for Drifters.',
      'Drifters are good players with awkward abilities. Help the crew doubt each other.',
      'Claiming a Drifter is a safe bluff for you, since there are lots of them.',
    ],
    flavor: 'Brought "a few extra passengers" through customs.',
  },

  // ---------------- THE PARASITE (Demon) ----------------
  parasite: {
    name: 'The Parasite', type: 'parasite', tb: 'Imp', icon: '🦑', minPlayers: 3, tags: [],
    ability: 'Each night*, choose a player: they die. If you choose yourself, you die & a Saboteur becomes the Parasite.',
    night: { first: false, other: true, choose: 1, order: 45 },
    tips: [
      'Kill players with strong information first, but watch out for the Medic and the Marine.',
      'Use your 3 bluffs (roles not in play) to make a believable claim.',
      'Late game, jumping hosts (choosing yourself) passes the Parasite to a Saboteur and can fool the crew.',
      '* You do not kill on the first night.',
    ],
    flavor: 'It came aboard as a stowaway, then ate the stowaway.',
  },
};

// Blood on the Clocktower's setup table, extended down to 3 players ("Short Haul").
//               crew drifters saboteurs parasite
const DISTRIBUTION = {
  3: [2, 0, 0, 1],
  4: [3, 0, 0, 1],
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 15;

// Evil players (and the Parasite's bluffs) are only shared in games of 7+, like Blood on the Clocktower.
const EVIL_INFO_MIN = 7;

function rolesOfType(type) {
  return Object.keys(ROLES).filter((id) => ROLES[id].type === type);
}

function teamOf(roleId) {
  return TYPES[ROLES[roleId].type].team;
}

module.exports = { ROLES, TYPES, TEAMS, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, EVIL_INFO_MIN, rolesOfType, teamOf };
