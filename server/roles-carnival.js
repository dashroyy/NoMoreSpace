// The roles that only exist in the "Cosmic Carnival" script (see scripts.js).
// Each is a space-circus version of a character from Blood on the Clocktower:
//   Lion Tamer    <- Exorcist        Method Actor <- Lunatic
//   Acrobat       <- Fool            Clown        <- Klutz
//   Palm Reader   <- Dreamer         Knife Thrower<- Assassin
//   Ticket Taker  <- Flowergirl      Stage Double <- Evil Twin
//   Stagehand     <- Chambermaid     Hexer        <- Witch
//   Magician      <- Professor       The Reflection <- Vortox
//
// Same fields as roles.js. Extra night fields used here:
//   once       : the ability can only be used once per game
//   notRepeat  : cannot choose the same player two nights in a row
//   target     : 'alive' (default) | 'dead' | 'any'

const CARNIVAL_ROLES = {
  // ---------------- CREW ----------------
  liontamer: {
    name: 'Lion Tamer', type: 'crew', tb: 'Exorcist', icon: '🦁', minPlayers: 5, tags: ['protect'],
    ability: 'Each night*, choose a player (a different one than last night): if they are the Parasite, it is stopped tonight and learns who you are.',
    night: { first: false, other: true, choose: 1, order: 38, notRepeat: true },
    tips: [
      'Guess right and the Parasite does nothing that night... but it also finds out who you are. Expect to be a target afterwards!',
      'Nobody died after you picked someone? They might be the Parasite. You cannot pick the same person two nights in a row, so alternate between your suspects.',
      'Keep your role quiet until you have good reasons to reveal it.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Has a whip, a chair and a very stern voice. The Parasite is not impressed. Yet.',
  },
  acrobat: {
    name: 'Acrobat', type: 'crew', tb: 'Fool', icon: '🤸', minPlayers: 5, tags: ['action'],
    ability: 'The 1st time you die, you don\'t. (Your safety net catches you.)',
    night: null,
    tips: [
      'The first time the Parasite picks you, or the crew airlocks you, nothing happens. Then your net is used up.',
      'Being airlocked and surviving proves you are good. That is worth a lot of trust.',
      'Bluff a juicy role (like the Lion Tamer) to make the Parasite waste its first kill on you.',
      'If you are glitched or drunk, your net has a hole in it.',
    ],
    flavor: 'Has fallen off everything. Has landed on everything.',
  },
  palmreader: {
    name: 'Palm Reader', type: 'crew', tb: 'Dreamer', icon: '🖐️', minPlayers: 5, tags: ['info'],
    ability: 'Each night, choose a player (not yourself): you see 2 roles, one good and one evil. One of them is their real role.',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 62 },
    tips: [
      'One vision is true. If you see a Crew role and a Saboteur, you know which two roles the player might be, so it is great for checking claims.',
      'Choose players who are claiming something specific. If neither vision matches their claim, they are lying (or you are glitched).',
      'Visions can catch a Reflection: if they never add up, something is lying to you.',
    ],
    flavor: 'Reads palms, tea leaves and, once, a very confusing hamster.',
  },
  tickettaker: {
    name: 'Ticket Taker', type: 'crew', tb: 'Flowergirl', icon: '🎟️', minPlayers: 5, tags: ['info'],
    ability: 'Each night*, you learn if the Parasite voted today.',
    night: { first: false, other: true, choose: 0, order: 64 },
    tips: [
      'Watch every vote carefully and write down who raised a hand: the Parasite\'s vote counts even when the nominee is not airlocked.',
      'A "yes" narrows the Parasite to the people who voted. Compare it across several days.',
      'You are a big target. Let a friend do the talking until you are sure.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Has punched a hole in every ticket on the ship. Knows exactly who was in the queue.',
  },
  stagehand: {
    name: 'Stagehand', type: 'crew', tb: 'Chambermaid', icon: '🎪', minPlayers: 5, tags: ['info'],
    ability: 'Each night, choose 2 living players (not yourself): you learn how many of them were woken tonight by their own abilities.',
    night: { first: true, other: true, choose: 2, notSelf: true, order: 63 },
    tips: [
      'You learn only a number (0, 1 or 2). Roles that act at night wake up; roles that never do (like the Acrobat) stay asleep.',
      'Check the same player over several nights: someone claiming a night role who never wakes is lying.',
      'Pair a player you trust with a suspect to get a clean answer about the suspect.',
    ],
    flavor: 'Dressed in black, always backstage, and the only person who knows who sneaks out at night.',
  },
  magician: {
    name: 'Magician', type: 'crew', tb: 'Professor', icon: '🎩', minPlayers: 7, tags: ['action'],
    ability: 'Once per game, at night*, choose a dead player: if they are Crew, they come back to life.',
    night: { first: false, other: true, choose: 1, target: 'dead', once: true, order: 47 },
    tips: [
      'Bring back a Crew member with good information, ideally someone the Parasite killed at night.',
      'Choosing a Drifter, Saboteur or the Parasite does nothing, and your trick is still used up.',
      'Tell your target first. If they agree and do not come back, they are probably evil!',
      '* You do not wake on the first night.',
    ],
    flavor: 'Pulls rabbits out of hats. Lately, crewmates out of the void. Please do not ask how.',
  },

  // ---------------- DRIFTERS ----------------
  clown: {
    name: 'Clown', type: 'drifter', tb: 'Klutz', icon: '🎈', minPlayers: 5, tags: [],
    ability: 'When you die, you publicly throw a pie at 1 living player: if they are evil, your team loses.',
    night: null,
    tips: [
      'Try not to die! If you do, you must pick someone. Choose a player you are SURE is good.',
      'If the game goes on after your pie, the player you picked was good (and you were not glitched).',
      'Evil players may claim to be the Clown to dodge the airlock. A real Clown would hate that.',
    ],
    flavor: 'Honk. Honk. (That is a warning.)',
  },
  actor: {
    name: 'Method Actor', type: 'drifter', tb: 'Lunatic', icon: '🎬', minPlayers: 6, tags: [],
    ability: 'You think you are the Parasite, but you are not. The real Parasite knows who you are and who you pick each night.',
    night: null,
    tips: [
      'You will never see this card. You believe you are the Parasite and "kill" someone each night, but nothing happens.',
      'If the nights keep going by with nobody dying from your picks, you might not be who you think you are.',
      'Whatever you do, the real Parasite is watching... and may use you as a decoy.',
    ],
    flavor: 'Is so deep in character that the character has stopped answering to the name Gary.',
  },

  // ---------------- SABOTEURS ----------------
  knifethrower: {
    name: 'Knife Thrower', type: 'saboteur', tb: 'Assassin', icon: '🗡️', minPlayers: 5, tags: ['action'],
    ability: 'Once per game, at night*, choose a player: they die, even if something should have saved them.',
    night: { first: false, other: true, choose: 1, once: true, order: 46 },
    tips: [
      'Your knife cannot be stopped by the Medic, the Marine, the Acrobat\'s net or anything else.',
      'Save it for a player the Parasite cannot reach, or for the one thing nothing else can kill.',
      'You can also kill one of your own to look innocent... if you dare.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Never misses. Has been asked, politely, to stop trying to miss on purpose.',
  },
  stagedouble: {
    name: 'Stage Double', type: 'saboteur', tb: 'Evil Twin', icon: '👯', minPlayers: 7, tags: [],
    ability: 'You and a good player (your twin) know each other. If your twin is airlocked, evil wins. The crew cannot win while you and your twin both live.',
    night: null,
    tips: [
      'You and your twin know each other. Claim the same role as your twin: the crew will not know which of you is real.',
      'Argue hard against your own airlocking, like the real twin would.',
      'The crew must airlock YOU before they can win: if they airlock your twin, evil wins!',
    ],
    flavor: 'Auditioned for the part of "the good one". Got the part of "the other one".',
  },
  hexer: {
    name: 'Hexer', type: 'saboteur', tb: 'Witch', icon: '🧙', minPlayers: 5, tags: ['action'],
    ability: 'Each night, choose a player: if they nominate tomorrow, they die. If only 3 players are alive, you lose this ability.',
    night: { first: true, other: true, choose: 1, order: 11 },
    tips: [
      'Hex the player who nominates the most, or the one with the strongest role. Their nomination still counts: they just do not live to see the result.',
      'Your victim is not told. They find out the hard way... which makes everyone else very nervous.',
      'Coordinate with the Parasite so you do not hex the player it plans to kill.',
    ],
    flavor: 'Runs the fortune-telling tent. The fortunes always come true. The fortunes are always bad.',
  },

  // ---------------- THE DEMON (a second kind of Parasite) ----------------
  reflection: {
    name: 'The Reflection', type: 'parasite', tb: 'Vortox', icon: '🪞', minPlayers: 7, tags: [],
    ability: 'Each night*, choose a player: they die. While you live, all Crew information is false. If a day ends with nobody airlocked, evil wins.',
    night: { first: false, other: true, choose: 1, order: 45 },
    tips: [
      'Every clue the crew gets is a lie, so give them confident, wrong "proof" and let them chase it.',
      'You win if the crew fails to airlock anyone in a day. Make them argue until the clock runs out!',
      'Mix in a few true statements so that nobody can prove the mirror is cracked.',
      '* You do not kill on the first night.',
    ],
    flavor: 'Came aboard as a carnival mirror. The Parasite took one look and moved in.',
  },
};

module.exports = { CARNIVAL_ROLES };
