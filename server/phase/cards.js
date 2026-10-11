// Phase to Space: every card in the game.
//
// A race to build the best starship crew. On your turn you spend 3 Energy to recruit Crew, equip Gear,
// run Protocols and hunt Void Beasts, while everyone else tries to Signal Jam your plans. You win by
// assembling a crew of all six disciplines, or by slaying three Void Beasts.
//
// The cards are plain data. What a card DOES is a list of steps (see "steps" in engine.js), so the same
// text on a card is also what the engine runs: [['discard', 2], ['destroy']] is "DISCARD 2 cards, then
// DESTROY a Crew card".

// The six disciplines. A crew with one of each (the Captain counts) wins the game.
const CLASSES = {
  marine: { id: 'marine', name: 'Marine', icon: '🪖', color: '#ff5a4d', blurb: 'Hits hard: destroys Crew and makes rivals discard.' },
  warden: { id: 'warden', name: 'Warden', icon: '🛡️', color: '#4da6ff', blurb: 'Protects the crew and sends cards back to hand.' },
  scout: { id: 'scout', name: 'Scout', icon: '🔭', color: '#4dff9a', blurb: 'Finds loot: draws and peeks at cards, gains Energy.' },
  smuggler: { id: 'smuggler', name: 'Smuggler', icon: '🕶️', color: '#b36bff', blurb: 'Steals Crew, pulls cards from hands and swaps things round.' },
  psion: { id: 'psion', name: 'Psion', icon: '🔮', color: '#ff6bd6', blurb: 'Master of Protocols and mind games.' },
  broadcaster: { id: 'broadcaster', name: 'Broadcaster', icon: '📡', color: '#ffd24d', blurb: 'Plays the crowd: free plays, shared draws and Boosts.' },
};
const CLASS_IDS = Object.keys(CLASSES);

// ---------------------------------------------------------------------------
// Captains: everyone starts with one. They count as a Crew member for the six disciplines, can never be
// destroyed, stolen or sent back to hand, and have a power for the whole game. Passives work on their own;
// an "ability" is a button you can press once per turn, for free.
// ---------------------------------------------------------------------------
const captain = (id, cls, name, title, art, text, extra) => ({ id, kind: 'captain', cls, name, title, art, text, ...extra });
const CAPTAINS = [
  captain('rex', 'marine', 'Cmdr. Rex Hardlight', 'Void Hunter', '🦖', 'You get +1 to your roll when you attack a Void Beast.', { passive: 'hunter' }),
  captain('brick', 'marine', 'Adm. Brick Thorne', 'Warlord', '🦏', 'Each time you DESTROY a Crew card, DRAW a card.', { passive: 'bounty' }),
  captain('aurelia', 'warden', 'Warden Aurelia Vance', 'Bulwark', '🦄', 'Each time one of your Crew cards is destroyed, DRAW a card.', { passive: 'grit' }),
  captain('obi', 'warden', 'Sentinel Obi-Wun', 'Quartermaster', '🐘', 'Each time you play a Gear card, DRAW a card.', { passive: 'rigger' }),
  captain('juno', 'scout', 'Pathfinder Juno Starling', 'Quick Draw', '🦅', 'Your first DRAW action each turn costs no Energy.', { passive: 'quickdraw' }),
  captain('pip', 'scout', 'Trailblazer Pip Orbit', 'Lucky Star', '🐿️', 'You get +1 to all your Crew effect rolls.', { passive: 'lucky' }),
  captain('mara', 'smuggler', "Capt. Mara 'Fingers' Quill", 'Sticky Fingers', '🦊', 'ONCE PER TURN (free): PULL a random card from another player\'s hand.', { ability: 'pickpocket' }),
  captain('silas', 'smuggler', 'Baron Silas Shade', 'Black Market', '🦇', 'Each time you STEAL a Crew card, DRAW a card.', { passive: 'fence' }),
  captain('zephyra', 'psion', 'Oracle Zephyra Nox', 'Mind Over Matter', '🐙', 'Each time you play a Protocol, DRAW a card.', { passive: 'echo' }),
  captain('xan', 'psion', "Archmage Xan'thor", 'Mind Reader', '👽', 'ONCE PER TURN (free): LOOK at another player\'s hand.', { ability: 'mindread' }),
  captain('cosmo', 'broadcaster', 'Maestro Cosmo Vibe', 'Amplify', '🦜', 'Your Boost cards give +1 more on their plus side.', { passive: 'amplify' }),
  captain('dolly', 'broadcaster', 'Host Dolly Static', 'Swap Meet', '🦙', 'ONCE PER TURN (free): DISCARD a card, then DRAW a card.', { ability: 'loot' }),
];

// ---------------------------------------------------------------------------
// Crew: put them in your party and roll 2 dice to use their effect. Roll the number on the card or
// higher. Playing one from your hand lets you roll for it straight away; after that you can pay
// 1 Energy to roll for it again, once per turn.
// ---------------------------------------------------------------------------
const crew = (id, cls, name, art, req, text, fx) => ({ id, kind: 'crew', cls, name, art, req, text, fx });
const CREW = [
  // ---- Marines ----
  crew('slab', 'marine', 'Sgt. Slab', '🐻', 9, 'DESTROY a Crew card.', [['destroy']]),
  crew('rampage', 'marine', 'Rampage-9', '🤖', 7, 'DISCARD 2 cards, then DESTROY a Crew card.', [['discard', 2], ['destroy']]),
  crew('betty', 'marine', 'Boomstick Betty', '🦝', 8, 'Every other player must DISCARD a card.', [['othersDiscard', 1]]),
  crew('hank', 'marine', 'Hammerhead Hank', '🦈', 7, 'ATTACK a Void Beast for free (no Energy).', [['attackFree']]),
  crew('gizmo', 'marine', 'Gunny Gizmo', '🐹', 6, "LOOK at another player's hand, then DISCARD a card from it.", [['peekHand', 'discard']]),
  crew('jaws', 'marine', 'Iron Jaws', '🐊', 5, 'DRAW a card, then SEARCH the discard pile for a Gear card and take it.', [['draw', 1], ['search', 'gear']]),
  // ---- Wardens ----
  crew('ellie', 'warden', 'Ellie Aegis', '🐘', 7, 'SHIELD one of your Crew cards: it cannot be destroyed or stolen until your next turn.', [['shield', 'one']]),
  crew('bulwark', 'warden', 'Bulwark Bot', '⚙️', 6, 'Return one of your Crew cards to your hand, then DRAW 2 cards.', [['returnOwn'], ['draw', 2]]),
  crew('moth', 'warden', 'Mama Moth', '🦋', 8, "Return any Crew card to its owner's hand.", [['bounce']]),
  crew('quill', 'warden', 'Quartermaster Quill', '🦉', 4, 'Play a Gear card from your hand for free. If you have none, DRAW a card.', [['playFree', 'gear', 'draw']]),
  crew('barnaby', 'warden', 'Barrier Barnaby', '🐢', 9, 'Your cards cannot be challenged for the rest of this turn.', [['noChallenge']]),
  crew('sprocket', 'warden', 'Sentry Sprocket', '🛰️', 10, 'SHIELD all of your Crew cards until your next turn.', [['shield', 'all']]),
  // ---- Scouts ----
  crew('bullseye', 'scout', 'Bullseye Pip', '🐿️', 7, 'LOOK at the top 3 cards of the deck. Take 1 into your hand, put the rest on the bottom.', [['peekDeck', 3]]),
  crew('pug', 'scout', 'Pathfinder Pug', '🐶', 6, 'DRAW 2 cards.', [['draw', 2]]),
  crew('rae', 'scout', 'Radar Rae', '🦇', 8, "LOOK at another player's hand, then DRAW a card.", [['peekHand', 'none'], ['draw', 1]]),
  crew('wanda', 'scout', 'Warp Wanda', '🦅', 9, 'Gain 2 Energy.', [['energy', 2]]),
  crew('racc', 'scout', 'Rocket Racc', '🦝', 7, 'DRAW a card. If it is a Crew card, play it for free.', [['drawPlay']]),
  crew('nibble', 'scout', 'Nibble Navigator', '🐇', 6, 'DRAW a card, then SEARCH the discard pile for any card and take it.', [['draw', 1], ['search', 'any']]),
  // ---- Smugglers ----
  crew('whiskers', 'smuggler', 'Slick Whiskers', '🐱', 9, "STEAL a Crew card, then PULL a random card from that player's hand.", [['steal'], ['pullFromLast']]),
  crew('pete', 'smuggler', 'Pocket Pete', '🦔', 5, "PULL a random card from another player's hand.", [['pull']]),
  crew('dodgy', 'smuggler', 'Dr. Dodgy', '🐍', 8, 'SWAP hands with another player.', [['swapHands']]),
  crew('larceny', 'smuggler', 'Lady Larceny', '🦜', 8, 'Move a Gear card from any Crew card onto one of your Crew cards that has no Gear.', [['gearMove']]),
  crew('shrimp', 'smuggler', 'Shadow Shrimp', '🦐', 7, 'Choose another player: they must SACRIFICE a Crew card of their choice.', [['forceSacrifice']]),
  crew('nyx', 'smuggler', 'Nyx the Nightcrawler', '🪱', 9, "LOOK at another player's hand and take any card from it.", [['peekHand', 'take']]),
  // ---- Psions ----
  crew('mindwave', 'psion', 'Madam Mindwave', '🐙', 8, 'DRAW 2 cards, then play a Protocol from your hand for free.', [['draw', 2], ['playFree', 'protocol']]),
  crew('zorp', 'psion', 'Zorp the Seer', '👽', 6, 'SEARCH the discard pile for a Protocol card and take it.', [['search', 'protocol']]),
  crew('pondering', 'psion', 'Pondering Pete', '🐸', 10, "STEAL a Crew card, then roll to use that Crew card's effect straight away.", [['stealUse']]),
  crew('glow', 'psion', 'Gizmo Glow', '🐨', 7, "Return every Gear card in play to its owner's hand, then DRAW a card.", [['gearsHome'], ['draw', 1]]),
  crew('cassie', 'psion', 'Cosmic Cassie', '🦄', 7, 'DRAW 3 cards, then DISCARD 2 cards.', [['draw', 3], ['discard', 2]]),
  crew('quark', 'psion', 'Dr. Quark', '🦑', 8, 'DESTROY a Gear card in play, then DRAW a card.', [['gearDestroy'], ['draw', 1]]),
  // ---- Broadcasters ----
  crew('tootie', 'broadcaster', 'Tipsy Tootie', '🦆', 7, 'DRAW a card, then play a Crew card from your hand for free.', [['draw', 1], ['playFree', 'crew']]),
  crew('wobble', 'broadcaster', 'DJ Wobble', '🐧', 5, 'Every player DRAWs a card (you too).', [['everyoneDraw', 1]]),
  crew('hippo', 'broadcaster', 'Hype Hippo', '🦛', 8, 'You get +1 to all your rolls until the end of this turn, and DRAW a card.', [['rollBuff', 1], ['draw', 1]]),
  crew('lemur', 'broadcaster', 'Lucky Lemur', '🐒', 7, "Choose another player: you both roll. Win and you take a random card from their hand; lose and they take one from yours.", [['luckDuel']]),
  crew('alpaca', 'broadcaster', 'Applause Alpaca', '🦙', 8, 'Reveal the top 4 cards of the deck. Take every Boost card you find, put the rest on the bottom.', [['topBoosts', 4]]),
  crew('karaoke', 'broadcaster', 'Captain Karaoke', '🦁', 9, 'Every player passes their whole hand to the player on their left.', [['passHands']]),
];

// ---------------------------------------------------------------------------
// Gear: slide one under a Crew card (never a Captain). Each Crew card holds one Gear. If its Crew card
// leaves play, the Gear goes with it. Cursed Gear is nasty: equip it to a RIVAL's Crew card.
// ---------------------------------------------------------------------------
const gear = (id, name, art, text, props, count = 1) => ({ id, kind: 'gear', name, art, text, count, cursed: false, ...props });
const GEAR = [
  gear('blaster', 'Plasma Blaster', '🔫', '+2 to this Crew card\'s effect rolls.', { roll: 2 }, 2),
  gear('cell', 'Overcharged Cell', '🔋', "Using this Crew card's effect costs no Energy.", { free: true }, 2),
  gear('plate', 'Deflector Plate', '🛡️', 'This Crew card cannot be destroyed or stolen.', { ward: true }, 2),
  gear('jetpack', 'Emergency Jetpack', '🚀', 'If this Crew card is destroyed, it returns to its owner\'s hand instead.', { rebound: true }),
  gear('clover', 'Lucky Clover', '🍀', "When this Crew card's effect works, DRAW a card.", { loot: true }),
  gear('rations', 'Questionable Rations', '🥫', "CURSED: -2 to this Crew card's effect rolls.", { roll: -2, cursed: true }, 2),
  gear('anchor', 'Gravity Anchor', '⚓', "CURSED: using this Crew card's effect costs 1 more Energy.", { cost: 1, cursed: true }),
  gear('collar', 'Silence Collar', '🔇', "CURSED: this Crew card cannot use its effect.", { silence: true, cursed: true }),
  gear('bomb', 'Ticking Bomb', '💣', "CURSED: when this Crew card's effect roll fails, it is DESTROYED.", { bomb: true, cursed: true }),
];

// ---------------------------------------------------------------------------
// Protocols: one-shot tricks. Run them, then the card is discarded. (They can be Signal Jammed.)
// ---------------------------------------------------------------------------
const protocol = (id, name, art, text, fx, count = 1) => ({ id, kind: 'protocol', name, art, text, fx, count });
const PROTOCOLS = [
  protocol('strike', 'Orbital Strike', '☄️', 'DISCARD a card, then DESTROY a Crew card.', [['discard', 1], ['destroy']], 2),
  protocol('salvage', 'Salvage Run', '♻️', 'SEARCH the discard pile for a Crew card and take it.', [['search', 'crew']], 2),
  protocol('overclock', 'Overclock', '⚡', 'DRAW 2 cards, then play a Crew card from your hand for free.', [['draw', 2], ['playFree', 'crew']], 2),
  protocol('gravwell', 'Gravity Well', '🌀', "Return every Gear card in play to its owner's hand.", [['gearsHome']]),
  protocol('mindcontrol', 'Mind Control', '🧠', 'DISCARD 2 cards, then STEAL a Crew card.', [['discard', 2], ['steal']]),
  protocol('phaseout', 'Phase Out', '🫥', "Return any Crew card to its owner's hand.", [['bounce']], 2),
  protocol('swap', 'Forced Swap', '🔁', 'SWAP one of your Crew cards with a Crew card of another player.', [['swapCrew']]),
  protocol('supply', 'Supply Drop', '📦', 'DRAW 3 cards.', [['draw', 3]], 2),
  protocol('reset', 'Hard Reset', '🔄', 'Every player DISCARDs their hand, then DRAWs 4 cards.', [['hardReset', 4]]),
  protocol('intel', 'Counter-Intel', '🕵️', "LOOK at another player's hand and DISCARD every Signal Jam in it.", [['peekHand', 'jam']]),
  protocol('jump', 'Hyperspace Jump', '⏩', 'Gain 2 Energy.', [['energy', 2]]),
];

// ---------------------------------------------------------------------------
// Boosts: play one on ANY roll (yours or a rival's) the moment it lands. Pick one of the two numbers.
// Free to play. Several can pile onto the same roll.
// ---------------------------------------------------------------------------
const boost = (id, name, art, up, down, count) => ({ id, kind: 'boost', name, art, up, down, count, text: `+${up} or ${down} to any roll.` });
const BOOSTS = [
  boost('b42', 'Overdrive', '🚀', 4, -2, 2),
  boost('b31', 'Power Surge', '⚡', 3, -1, 4),
  boost('b33', 'Chaos Coil', '🌀', 3, -3, 3),
  boost('b22', 'Quick Fix', '🔧', 2, -2, 4),
  boost('b13', 'Static Burst', '📻', 1, -3, 3),
  boost('b24', 'Glitch', '👾', 2, -4, 2),
  boost('b44', 'Warp Spike', '🔱', 4, -4, 1),
  boost('b55', 'Reality Tear', '🌌', 5, -5, 1),
];

// A Signal Jam answers someone playing a Crew, Gear or Protocol card: both of you roll, and if you roll
// the same or higher, their card is wasted.
const CHALLENGE = { id: 'jam', kind: 'challenge', name: 'Signal Jam', art: '📻', count: 8, text: 'Play when another player plays a Crew, Gear or Protocol card. Both roll: if you roll equal or higher, their card is discarded.' };

// ---------------------------------------------------------------------------
// Void Beasts: three are always up for grabs. To ATTACK one (2 Energy) your crew must meet its requirement
// ("2 Crew" means two Crew cards that are not Captains; a class means one Crew member of that class, your
// Captain counts), then roll 2 dice. Slay number or more: the Beast joins your party and gives you its
// power for the rest of the game. At or under the fail number: you pay the price. In between: nothing.
// ---------------------------------------------------------------------------
const beast = (id, name, art, reqs, slay, fail, penalty, passive, text) => ({ id, kind: 'beast', name, art, reqs, slay, fail, penalty, passive, text });
const BEASTS = [
  beast('slug', 'Nebula Slug', '🐌', [{ any: 2 }], 7, 4, 'sacrifice', 'playdraw', 'Each time you play a Crew card from your hand, DRAW a card.'),
  beast('gloop', 'Gloop Cluster', '🦠', [{ any: 2 }], 8, 5, 'sacrifice', 'loot', 'ONCE PER TURN (free): DISCARD a card, then DRAW a card.'),
  beast('gnasher', 'Asteroid Gnasher', '☄️', [{ any: 3 }], 8, 5, 'discard2', 'effect', 'You get +1 to all your Crew effect rolls.'),
  beast('wraith', 'Static Wraith', '👻', [{ cls: 'psion' }, { any: 1 }], 8, 5, 'sacrifice', 'ward', 'Your Crew cards cannot be stolen.'),
  beast('ripper', 'Rust Ripper', '🤖', [{ cls: 'marine' }, { any: 1 }], 8, 5, 'sacrifice', 'attack', 'You get +2 to your roll when you attack a Void Beast.'),
  beast('kraken', 'Lunar Kraken', '🦑', [{ any: 3 }], 9, 6, 'sacrifice', 'rebound', 'When one of your Crew cards would be destroyed, return it to your hand instead.'),
  beast('scorpion', 'Sun Scorpion', '🦂', [{ cls: 'smuggler' }, { any: 1 }], 9, 6, 'discard2', 'challenger', 'You get +2 to your rolls when you challenge, or are challenged.'),
  beast('hound', 'Comet Hound', '🐺', [{ cls: 'scout' }, { any: 1 }], 8, 5, 'sacrifice', 'startdraw', 'At the start of your turn, DRAW a card.'),
  beast('bhmoth', 'Black Hole Moth', '🦋', [{ cls: 'warden' }, { any: 1 }], 9, 6, 'sacrifice', 'boostbonus', 'When another player plays a Boost on your roll, you get +1.'),
  beast('siren', 'Siren Satellite', '🛰️', [{ cls: 'broadcaster' }, { any: 1 }], 8, 5, 'discard2', 'jamdraw', 'Each time you win a Signal Jam roll, DRAW a card.'),
  beast('whale', 'Gravity Whale', '🐋', [{ any: 4 }], 10, 6, 'sacrifice', 'energy', 'You have 1 more Energy each turn.'),
  beast('dragon', 'Void Dragon', '🐉', [{ cls: 'marine' }, { cls: 'warden' }], 10, 7, 'sacrifice', 'rolls', 'You get +1 to ALL your rolls.'),
  beast('queen', 'Hive Queen', '🐝', [{ cls: 'scout' }, { any: 2 }], 10, 6, 'sacrifice', 'effect', 'You get +1 to all your Crew effect rolls.'),
  beast('serpent', 'Quasar Serpent', '🐍', [{ cls: 'psion' }, { cls: 'smuggler' }], 10, 7, 'sacrifice', 'ward', 'Your Crew cards cannot be stolen.'),
  beast('eater', 'The Planet-Eater', '🪐', [{ any: 5 }], 11, 7, 'sacrifice', 'energy', 'You have 1 more Energy each turn.'),
];

// ---------------------------------------------------------------------------

const ALL = [...CAPTAINS, ...CREW, ...GEAR, ...PROTOCOLS, ...BOOSTS, CHALLENGE, ...BEASTS];
const BY_ID = Object.fromEntries(ALL.map((c) => [c.id, c]));
if (Object.keys(BY_ID).length !== ALL.length) throw new Error('Phase to Space: two cards share an id');

// A card definition by its id (ids are unique across the whole game).
function def(id) {
  return BY_ID[id];
}

// What goes in the main deck: every Crew card once, and as many copies of the rest as they list.
function deckList() {
  const list = [];
  for (const c of CREW) list.push(c);
  for (const c of [...GEAR, ...PROTOCOLS, ...BOOSTS, CHALLENGE]) for (let i = 0; i < (c.count || 1); i++) list.push(c);
  return list;
}

// Everything the browser needs to draw and explain the cards.
const CLIENT_DATA = { classes: CLASSES, classIds: CLASS_IDS, captains: CAPTAINS, crew: CREW, gear: GEAR, protocols: PROTOCOLS, boosts: BOOSTS, challenge: CHALLENGE, beasts: BEASTS };

module.exports = { CLASSES, CLASS_IDS, CAPTAINS, CREW, GEAR, PROTOCOLS, BOOSTS, CHALLENGE, BEASTS, def, deckList, CLIENT_DATA };
