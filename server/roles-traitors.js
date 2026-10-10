// The roles that only exist in the "Citadel of Traitors" script (see scripts.js),
// a space-castle version of the TV game show The Traitors. A few of the guests are
// secretly Traitors, cloaked in black. By night the Head Traitor murders a Faithful,
// and a Recruiter can offer another Faithful a cloak of their own. By day everyone
// sits at the Round Table and banishes somebody, who is then unmasked.
//
// The show's own mechanics, as script rules (scripts.js, `mechanics`):
//   * the Traitors know each other from the start (the Turret),
//   * every day, the guest who did the most missions (tasks) wins a Shield that stops
//     the Traitors murdering them that night, and the missions build the Prize Pot,
//   * a banished guest is unmasked as Faithful or Traitor,
//   * the Faithful win when every Traitor is banished; the Traitors win when they are
//     as many as the Faithful,
//   * if the Head Traitor goes, another Traitor takes the cloak and the murders go on.
//
// Same fields as roles.js.

const TRAITORS_ROLES = {
  // ---------------- THE FAITHFUL ----------------
  seer: {
    name: 'Seer', type: 'crew', tb: 'Fortune Teller', icon: '🔮', minPlayers: 5, tags: ['info'],
    ability: 'Once per game, at night, choose a player: you learn whether they are a Traitor. If they are, they learn who you are.',
    night: { first: true, other: true, choose: 1, notSelf: true, once: true, order: 60 },
    tips: [
      'One look, and it is the truest information in the game. Spend it on someone the table is about to trust, or on the one everyone is afraid of.',
      'If you look at a Traitor, they find out who you are. Expect to be murdered next, unless you have a Shield or a Guardian.',
      'The Mole looks Faithful to your crystal ball. Be careful when a very quiet, very helpful guest passes your test.',
      'You can wait. Choose nobody and your ball stays ready.',
    ],
    flavor: 'Has a crystal ball, a tarot deck and no time for small talk.',
  },
  daggerbearer: {
    name: 'Dagger Bearer', type: 'crew', tb: 'Mayor', icon: '🗡️', minPlayers: 6, tags: ['action'],
    ability: 'Your YES votes at the Round Table count twice.',
    night: null,
    tips: [
      'Nobody knows you hold the dagger. When the count is one vote short of a banishment, yours is worth two.',
      'The tally shows more votes than hands: be ready to explain it, or let the table wonder.',
      'The Traitors will murder you if they learn you are the Dagger Bearer. Keep it quiet until it counts.',
      'If you are glitched, your dagger turns to rubber and your votes count once.',
    ],
    flavor: 'Won it in a game of hide-and-seek, and has been told not to wave it about.',
  },
  guardian: {
    name: 'Guardian', type: 'crew', tb: 'Monk', icon: '🏰', minPlayers: 5, tags: ['protect'],
    ability: 'Each night, choose a player (not yourself, and not the same one as last night): the Traitors cannot murder them tonight.',
    night: { first: true, other: true, choose: 1, notSelf: true, notRepeat: true, order: 12 },
    tips: [
      'Guard whoever the Traitors most want dead: the player who has been most helpful at the Round Table.',
      'A Shield from a mission works the same way. If the Traitors strike a guarded player, nobody dies.',
      'You cannot guard the same player twice in a row, and not yourself. Plan two nights ahead.',
      'If you are glitched, your watch fails for a night and a day.',
    ],
    flavor: 'Stands at a doorway all night, pretending to be a coat rack.',
  },
  loyalist: {
    name: 'Loyalist', type: 'crew', tb: 'Soldier', icon: '💂', minPlayers: 5, tags: ['action'],
    ability: 'You cannot be recruited. If a Traitor tries, you are told that someone tried.',
    night: null,
    tips: [
      'A Recruiter\'s offer simply fails on you, and you learn that a Recruiter is aboard. Tell the table, or keep it for the right moment.',
      'The Recruiter does not know you refused for a reason: they may think you are just stubborn.',
      'Do not wear your loyalty on your sleeve: a Traitor who learns you are a Loyalist will murder you instead.',
    ],
    flavor: 'Has never once been tempted, and has a mug that says so.',
  },

  // ---------------- THE TRAITORS ----------------
  recruiter: {
    name: 'Recruiter', type: 'saboteur', tb: 'Scarlet Woman', icon: '✉️', minPlayers: 6, tags: ['action'],
    ability: 'Once per game, at night*, choose a Faithful player: they are offered a place among the Traitors. If they accept, they become a Traitor.',
    night: { first: false, other: true, choose: 1, notSelf: true, once: true, order: 14 },
    tips: [
      'The offer arrives at dawn, and they have one minute to say yes or no. You will be told the answer.',
      'Choose someone who is angry, or who has just been wrongly accused. They may not say no.',
      'A refusal is a danger: they now know a Recruiter is aboard. Be ready to silence them.',
      'A Loyalist cannot be recruited, and a Shield does not protect against the offer.',
      '* You do not wake on the first night.',
    ],
    flavor: 'Delivers invitations in black envelopes, sealed with wax and a small amount of menace.',
  },
  mole: {
    name: 'Mole', type: 'saboteur', tb: 'Spy', icon: '🕵️', minPlayers: 7, tags: [],
    ability: 'You are a Traitor, but you look Faithful to every check: the Seer, the Scanner and the rest.',
    night: null,
    tips: [
      'When the Seer looks at you, they will see a Faithful. Let them tell everyone so.',
      'You are the Traitors\' best friend at the Round Table: speak up for the Seer\'s "cleared" players, and steer the banishment elsewhere.',
      'You still count as a Traitor when the Faithful reach for a win, and when you are banished you are unmasked as one.',
    ],
    flavor: 'Has a Faithful badge, a Traitor\'s cloak and an alibi for everything.',
  },
  blackmailer: {
    name: 'Blackmailer', type: 'saboteur', tb: 'Witch', icon: '🤐', minPlayers: 6, tags: ['action'],
    ability: 'Each night, choose a player (not yourself): tomorrow they cannot nominate, and their vote is ignored.',
    night: { first: true, other: true, choose: 1, notSelf: true, order: 15 },
    tips: [
      'Silence the player who will nominate a Traitor, or the one whose vote would tip the Round Table.',
      'Your victim is told at dawn, so they will say so out loud: pick someone nobody will believe, or a decoy.',
      'You cannot blackmail yourself. The Head Traitor may be on your list too.',
    ],
    flavor: 'Knows everything about everybody, and says so very quietly.',
  },
  headtraitor: {
    name: 'The Head Traitor', type: 'parasite', tb: 'Imp', icon: '🦇', minPlayers: 5, tags: [],
    ability: 'Each night*, choose a player (not yourself): they are murdered. If you are banished, another Traitor takes your cloak and the murders go on.',
    night: { first: false, other: true, choose: 1, notSelf: true, order: 45 },
    tips: [
      'Murder the guests with the best information first, but watch for Shields and the Guardian: a blocked murder wastes the night.',
      'You are not alone: your fellow Traitors can talk to you in the secret channel. Agree on a target together, and on a story.',
      'If you are banished, the cloak passes to another Traitor. Do not give up: make sure someone is alive to take it.',
      'You win when the Traitors are as many as the Faithful. A Recruiter can get you there.',
      '* You do not murder on the first night.',
    ],
    flavor: 'Smiles at the Round Table. Has been smiling since before the doors shut.',
  },
  // The Faithful who accepted a Recruiter's offer. Not dealt at the start of a game.
  recruit: {
    name: 'Recruit', type: 'saboteur', tb: 'Minion', icon: '🐍', minPlayers: 5, tags: [],
    ability: 'You were Faithful, and accepted a Recruiter\'s offer. You are a Traitor now, and you know who the others are.',
    night: null,
    tips: [
      'Nobody saw you accept. At the Round Table, you are still the same trusted guest you were yesterday.',
      'You count as a Traitor from now on: when the Traitors are as many as the Faithful, you win with them.',
      'If you are banished, you are unmasked as a Traitor. Do not make it easy for the Faithful.',
    ],
    flavor: 'Said no for about thirty seconds.',
  },
};

module.exports = { TRAITORS_ROLES };
