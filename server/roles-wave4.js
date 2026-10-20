// The fourth wave: a Crew role, a Drifter and a Saboteur for every script. Each one makes a moment the whole
// table sees (a death that drags someone else down, a hatch that will not open, a pie-style last act):
//
//   Black Hole Blues  🧓 Mentor (Grandmother)      🌠 Stargazer (Moonchild)      🔧 Airlock Tech (Devil's Advocate)
//   Cosmic Carnival   🏋️ Strongman (Tea Lady)      💘 Heartthrob (Sweetheart)    🎤 Showboat (Goblin)
//   Outbreak          🔬 Pathologist (Sage)         🤧 Superspreader              🧪 Mutagen
//   Citadel           ⚒️ Blacksmith                 🃏 Court Fool                 🗡️ Avenger (Godfather)
//
// The rules for each are in engine.js (search for the role's id).

const WAVE4_ROLES = {
  // ---------------- Black Hole Blues ----------------
  mentor: {
    name: 'Mentor', type: 'crew', tb: 'Grandmother', icon: '🧓', minPlayers: 5, tags: ['info'],
    ability: 'You start knowing a good player and their role. If the Parasite kills them, you die too.',
    night: { first: true, other: false, choose: 0, order: 31 },
    tips: [
      'You know one good player for sure. Back them up when the crew turns on them.',
      'Do not shout their name too early: the Parasite would love to kill them (and you with them).',
      'If you are glitched on the first night, the player you learn might be wrong.',
    ],
    flavor: 'Trained half the crew. Still calls the captain "kiddo".',
  },
  stargazer: {
    name: 'Stargazer', type: 'drifter', tb: 'Moonchild', icon: '🌠', minPlayers: 5, tags: [],
    ability: 'When you die, publicly choose a living player. If they are good, they die too.',
    night: null,
    tips: [
      'Your last pick had better be evil, or you take a crewmate with you.',
      'Keep notes while you are alive: your last act is a guess, and the crew will want it to be a good one.',
      'If you dither, the stars choose for you, at random.',
    ],
    flavor: 'Reads fortunes in the star charts. Lately they all say the same thing.',
  },
  airlocktech: {
    name: 'Airlock Tech', type: 'saboteur', tb: "Devil's Advocate", icon: '🔧', minPlayers: 5, tags: [],
    ability: 'Each night, choose a living player (not the same as last night). If they are airlocked tomorrow, the hatch fails and they survive.',
    night: { first: true, other: true, choose: 1, notRepeat: true, order: 14 },
    tips: [
      'Rig the hatch for the Parasite, or for yourself, on days the crew is closing in.',
      'Rigging a good player wastes a day of airlocking for the crew: they look guilty, and they live.',
      'You cannot pick the same player two nights running.',
    ],
    flavor: 'Has a spare key to every hatch on the ship. And a few extra screws.',
  },

  // ---------------- Cosmic Carnival ----------------
  strongman: {
    name: 'Strongman', type: 'crew', tb: 'Tea Lady', icon: '🏋️', minPlayers: 5, tags: ['protect'],
    ability: 'If both your living neighbours are good, the Parasite cannot kill them.',
    night: null,
    tips: [
      'Your neighbours are safe at night while all three of you are good. A night death next to you means one of them is not.',
      'Sit tight and say who you are: the Parasite will have to go elsewhere.',
      'If you are glitched, your arms are jelly: nobody is protected.',
    ],
    flavor: 'Lifts the elephant twice a show. Lifts the mood never.',
  },
  heartthrob: {
    name: 'Heartthrob', type: 'drifter', tb: 'Sweetheart', icon: '💘', minPlayers: 5, tags: [],
    ability: 'When you die, someone is heartbroken: their ability malfunctions for the rest of the game.',
    night: null,
    tips: [
      'Stay alive. When you go, a random player\'s ability breaks for good, and nobody is told who.',
      'If you are airlocked, the crew loses a little bit of truth for the rest of the game.',
      'After you die, any odd clue might be a broken heart talking.',
    ],
    flavor: 'Has a fan club in every ring of the big top. Most of them cry a lot.',
  },
  showboat: {
    name: 'Showboat', type: 'saboteur', tb: 'Goblin', icon: '🎤', minPlayers: 5, tags: [],
    ability: 'If you publicly claim to be the Showboat and the crew airlocks you that same day, evil wins.',
    night: null,
    tips: [
      'Claim Showboat (the claim button) on the day you are about to be airlocked. Then they daren\'t.',
      'A good player might claim Showboat to dodge the airlock too. Make the crew guess.',
      'The claim only counts for the day you make it.',
    ],
    flavor: 'Will do anything for an encore. Including the last one.',
  },

  // ---------------- Outbreak ----------------
  pathologist: {
    name: 'Pathologist', type: 'crew', tb: 'Sage', icon: '🔬', minPlayers: 5, tags: ['info'],
    ability: 'If you die at night, you learn the Demon is 1 of 2 players.',
    night: null,
    tips: [
      'Your ability works when you die at night: by bursting, or by being killed.',
      'Ghosts can still talk. Tell the crew your two names at once.',
      'Bursting does not cloud your mind, but a glitch does: then the names may be wrong.',
    ],
    flavor: 'Has looked inside more crewmates than the ship\'s cook. Takes notes.',
  },
  superspreader: {
    name: 'Superspreader', type: 'drifter', tb: null, icon: '🤧', minPlayers: 5, tags: [],
    ability: 'If you burst, both your living neighbours are infected.',
    night: null,
    tips: [
      'If you get a fever, tell the crew right away: a Vaccinator must cure YOU first.',
      'When you burst, your neighbours catch it. Warn them.',
      'You are good, just very, very contagious.',
    ],
    flavor: 'Sneezes in every direction at once. Has never once covered their mouth.',
  },
  mutagen: {
    name: 'Mutagen', type: 'saboteur', tb: null, icon: '🧪', minPlayers: 5, tags: [],
    ability: 'Each night*, choose a player. If they are infected, they burst tonight, before any cure can reach them.',
    night: { first: false, other: true, choose: 1, notSelf: true, order: 16 },
    tips: [
      'Aim at whoever just told the crew they have a fever: they burst before the Vaccinator gets there.',
      'Choosing a healthy player does nothing, so pick the sick ones.',
      'The crew will notice fevers that end too soon. Spread your picks out.',
    ],
    flavor: 'Mixes something green in the lab every night. Never the same green twice.',
  },

  // ---------------- Citadel of Traitors ----------------
  blacksmith: {
    name: 'Blacksmith', type: 'crew', tb: null, icon: '⚒️', minPlayers: 7, tags: ['protect'],
    ability: 'Once per game, at night, forge a Shield for a guest (not yourself). It protects them every night until it stops a murder.',
    night: { first: true, other: true, choose: 1, notSelf: true, once: true, order: 13 },
    tips: [
      'Give it to the guest the Traitors most want dead: the one asking good questions.',
      'The Shield lasts until it is used, so the earlier you forge it, the more nights it covers.',
      'You can wait: choose nobody and keep the anvil warm for later.',
    ],
    flavor: 'Hammers out horseshoes by day, armour by night. Asks no questions.',
  },
  courtfool: {
    name: 'Court Fool', type: 'drifter', tb: null, icon: '🃏', minPlayers: 7, tags: [],
    ability: 'If you are banished, the Traitors murder TWO guests that night.',
    night: null,
    tips: [
      'Say who you are before the Round Table turns on you. Banishing you is a gift to the Traitors.',
      'The Traitors will want you banished. Watch who pushes for it.',
      'You are Faithful. Just not very good at it.',
    ],
    flavor: 'Tells jokes to the Traitors and the Faithful alike. Only one side is laughing.',
  },
  avenger: {
    name: 'Avenger', type: 'saboteur', tb: 'Godfather', icon: '🗡️', minPlayers: 7, tags: [],
    ability: 'If a Traitor was banished today, choose a guest tonight: they die.',
    night: { first: false, other: true, choose: 1, notSelf: true, order: 44 },
    tips: [
      'Every Traitor the Faithful catch costs them a life. Make them pay.',
      'Kill whoever led the vote against your friend: the Faithful will know why, and be scared.',
      'A Shield or the Guardian stops you just like it stops the Head Traitor.',
    ],
    flavor: 'Never forgets a face. Especially the ones that voted.',
  },
};

module.exports = { WAVE4_ROLES };
