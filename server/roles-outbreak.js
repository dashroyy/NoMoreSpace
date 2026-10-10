// The roles that only exist in the "Outbreak" script (see scripts.js): a research
// station where something is spreading. The Demon does not kill. It INFECTS, and
// an infected player bursts the next night unless somebody cures them.
//
// Each role is inspired by a character from Blood on the Clocktower:
//   Vaccinator      <- Monk / Doctor ideas      Patient Zero  <- Sweetheart / Saint
//   Contact Tracer  <- Fortune Teller / Seer    Hypochondriac <- Recluse (false positives)
//   Hazmat Tech     <- Soldier                  Bioterrorist  <- Poisoner (twice)
//   Blood Donor     <- Sailor / Preacher        Quack Doctor  <- Pit-Hag / Witch (false fevers)
//   Biohazard Sensor<- Empath                   Spore Host    <- Psychopath / Mezepheles
//   The Carrier     <- Pukka (poison, then death a night later)
//
// Same fields as roles.js. Rules shared by the infection roles:
//   * The Carrier infects a player each night. An infected player is told at once and
//     "bursts" (dies) when the NEXT night ends, unless they are cured that night.
//   * While infected, a player's abilities malfunction: information is false, and
//     protections and attacks fail.
//   * The Vaccinator cures an infected player, or shields a healthy one from infection.

const OUTBREAK_ROLES = {
  // ---------------- CREW ----------------
  vaccinator: {
    name: 'Vaccinator', type: 'crew', tb: 'Monk', icon: '💉', minPlayers: 5, tags: ['protect'],
    ability: 'Each night, choose a player (not yourself, and not the same one as last night): if they are infected, they are cured; if not, they cannot be infected tonight.',
    night: { first: true, other: true, choose: 1, notSelf: true, notRepeat: true, order: 12 },
    tips: [
      'An infected player bursts when the night ends, so you must pick them on the night they would burst. Listen at the table: infected players are told they have a fever.',
      'Be careful: an evil Quack Doctor can make healthy players feel feverish. A cure on a healthy person is just a shield for one night.',
      'You cannot protect the same player two nights in a row, and you cannot protect yourself.',
      'If you are infected your needle jams: your own vaccines do nothing until you are cured.',
    ],
    flavor: 'Carries a very large syringe and a very small sense of humour.',
  },
  tracer: {
    name: 'Contact Tracer', type: 'crew', tb: 'Fortune Teller', icon: '🧭', minPlayers: 5, tags: ['info'],
    ability: 'Each night, choose 2 players (not yourself): you learn how many of them are infected.',
    night: { first: true, other: true, choose: 2, notSelf: true, order: 61 },
    tips: [
      'You learn only a number (0, 1 or 2). Check a player who says they have a fever together with a player you trust.',
      'A Hypochondriac always shows up as infected, even though they are healthy.',
      'Infected people burst a night after they are infected, so test your suspects quickly.',
      'If you are infected, your tracing is wrong until you are cured.',
    ],
    flavor: 'Has a map of the whole station covered in string, and a mug that says "I told you so".',
  },
  hazmat: {
    name: 'Hazmat Tech', type: 'crew', tb: 'Soldier', icon: '🥽', minPlayers: 5, tags: ['action'],
    ability: 'You cannot be infected. The first time someone tries, you are told.',
    night: null,
    tips: [
      'Spores cannot get through your suit. When the Carrier tries to infect you, nothing happens to you, but you learn that a Carrier is at work.',
      'Your first warning is worth sharing with a Contact Tracer or a Scanner: it proves the sickness is spreading deliberately.',
      'The Carrier does not know you are in a suit, so you may be targeted over and over. Make that count.',
      'If the Hacker glitches you, your suit is full of holes for a night and a day.',
    ],
    flavor: 'Has not taken the suit off since the first day. Nobody has had the courage to ask.',
  },
  donor: {
    name: 'Blood Donor', type: 'crew', tb: 'Sailor', icon: '🩸', minPlayers: 7, tags: ['action'],
    ability: 'Once per game, at night, choose an infected player: they are cured, and YOU become infected instead.',
    night: { first: false, other: true, choose: 1, once: true, order: 13 },
    tips: [
      'A very brave trade: you swap places with an infected player. You will burst when the next night ends unless the Vaccinator cures you.',
      'Only use it on a player you are sure is truly infected and really worth saving. If they were not infected, the donation is wasted.',
      'You can save it for later: choose nobody and it stays ready.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Gave blood on the first day and has been asking for the juice and the biscuit ever since.',
  },
  sensor: {
    name: 'Biohazard Sensor', type: 'crew', tb: 'Empath', icon: '🚨', minPlayers: 5, tags: ['info'],
    ability: 'Each night, you learn whether someone was newly infected last night.',
    night: { first: true, other: true, choose: 0, order: 66 },
    tips: [
      'A "yes" means the Carrier, or the Bioterrorist, got through. A "no" means every attempt failed (a Hazmat Tech, a Vaccinator\'s shield), or nobody tried.',
      'Compare it with the Vaccinator: if the Sensor says "no" and the Vaccinator shielded someone, the Carrier probably picked that player.',
      'If you are infected your alarm lies until you are cured.',
    ],
    flavor: 'A very sensitive nose in a very small body, and an alarm that goes off if anyone sneezes.',
  },

  // ---------------- DRIFTERS ----------------
  patientzero: {
    name: 'Patient Zero', type: 'drifter', tb: 'Saint', icon: '🤒', minPlayers: 7, tags: [],
    ability: 'You start the game infected. You will burst when the second night ends, unless a Vaccinator cures you. You have no other ability.',
    night: null,
    tips: [
      'You know you are infected from the start, and the crew needs you alive: tell them! A Contact Tracer or the Vaccinator can help.',
      'You are good. If you are cured, you are one of the best-known innocents in the game.',
      'The Carrier is not responsible for your infection: nobody knows how you caught it. Maybe someone was careless in the lab.',
    ],
    flavor: 'Licked the mystery sample "to see". Was the first to say "huh, funny taste".',
  },
  hypochondriac: {
    name: 'Hypochondriac', type: 'drifter', tb: 'Recluse', icon: '😷', minPlayers: 6, tags: [],
    ability: 'Every dawn you are told you have a fever, but you never do. Contact Tracers count you as infected.',
    night: null,
    tips: [
      'You wake up every morning sure you are infected. You are not, and you will never burst from it.',
      'Be ready to be cured over and over by a hopeful Vaccinator, and to be "found" infected by a Contact Tracer.',
      'Do not claim your fever too loudly: a real infected player and a Quack Doctor victim sound exactly like you.',
    ],
    flavor: 'Has diagnosed themselves with everything except the thing that is actually wrong.',
  },

  // ---------------- SABOTEURS ----------------
  bioterrorist: {
    name: 'Bioterrorist', type: 'saboteur', tb: 'Poisoner', icon: '🧪', minPlayers: 7, tags: ['action'],
    ability: 'Once per game, at night*, choose a player: they are infected too, as if the Carrier had picked them.',
    night: { first: false, other: true, choose: 1, once: true, order: 14 },
    tips: [
      'Time your second infection so that two players are bursting on consecutive nights. The Vaccinator can only save one.',
      'You are blocked by the same things as the Carrier: a Hazmat Tech or a Vaccinator\'s shield.',
      'Choose someone the Carrier is NOT planning to infect, so the two of you do not waste a night on the same player.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Brought a second sample, "just in case". It was always going to be that kind of day.',
  },
  quack: {
    name: 'Quack Doctor', type: 'saboteur', tb: 'Pit-Hag', icon: '🎭', minPlayers: 6, tags: ['action'],
    ability: 'Each night, choose a player: they are told they feel feverish, but they are NOT infected.',
    night: { first: true, other: true, choose: 1, order: 15 },
    tips: [
      'A fake fever sounds exactly like a real one. Make the crew waste cures and nominate the wrong "patient".',
      'Your fake patient is told their abilities malfunction, so they will doubt their own information too.',
      'Pair a fake patient with the Carrier\'s real victim and nobody can tell which one is sick.',
    ],
    flavor: 'Diploma from a very reputable website. Prescribes "more rest" and "a vigorous shake".',
  },
  sporehost: {
    name: 'Spore Host', type: 'saboteur', tb: 'Psychopath', icon: '🍄', minPlayers: 8, tags: [],
    ability: 'If you are airlocked, the player who nominated you is infected.',
    night: null,
    tips: [
      'Being nominated is a gamble for the nominator: if the crew airlocks you, they catch your spores.',
      'The infected nominator will burst the very next night, unless a Vaccinator is ready. That is a death for one airlocking.',
      'If you are glitched, you are nothing but a harmless mushroom.',
    ],
    flavor: 'Smells of damp. Grows on you.',
  },

  // ---------------- THE DEMON ----------------
  carrier: {
    name: 'The Carrier', type: 'parasite', tb: 'Pukka', icon: '🦠', minPlayers: 5, tags: [],
    ability: 'Each night, choose a player (not yourself): they are infected. An infected player bursts when the next night ends, unless cured. If you die, evil loses.',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'Nobody dies the night you infect them. Everybody dies the night after, so you hit the crew a night later than a normal Parasite.',
      'Infect players the Vaccinator has not just shielded. A shielded target is not infected, and the Sensor will notice.',
      'Infected players will tell the crew they have a fever. Keep your team ready to say the same: a Quack Doctor can make healthy people feverish too.',
      'A Hazmat Tech cannot be infected. If you keep hitting the same person with no effect, they may be wearing a suit.',
    ],
    flavor: 'Doesn\'t cough on you. Just stands a little too close for a little too long.',
  },
};

module.exports = { OUTBREAK_ROLES };
