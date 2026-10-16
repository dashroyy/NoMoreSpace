// Star Bonanza: everything in the game that is not a rule. The twelve kinds of star buddy (the "beans"), how many of
// each are in the deck, and how many of a kind you need to harvest for 1, 2, 3 or 4 coins (the "beanometer").
//
// The game is an original, space-farm remake of the planting, trading and harvesting card game Bohnanza (Uwe
// Rosenberg, 1997). Mechanics are not owned by anyone; the names, the characters and the jokes here are our own. The
// card counts and the payout table are the real game's, since that balance has had twenty-five years of testing:
// the more of a kind in the deck, the more of them you need for each coin.
//
// Every kind is a little star with a face and a personality, and a name that is a pun on "star" (a Rock Star is a grumpy
// bearded miner, a Pop Star is a DJ, a Super Star is tiny and lifts weights). `real` is the astronomy name it hides.

// stars: how many in the deck, `table` = stars needed for 1, 2, 3, 4 coins (null = that payout does not exist)
// name: the pun; real: what it is in real life; persona: the two-word joke on the card; blurb: a line for How to play
// (eleven of them are the original game's beans; the Stink Star is our own, because every farm needs one)
const STARS = [
  { id: 'red-dwarf', name: 'Rock Star', real: 'Red Dwarf', persona: 'Grumpy miner', count: 24, table: [4, 7, 10, 12], color: '#ff5a4e', glow: '#c92a1e', size: 0.9, set: 'full', blurb: 'Digs for gold in a hard hat and a beard. Do not wake it before noon: rock stars sleep in.' },
  { id: 'brown-dwarf', name: 'Snooze Star', real: 'Brown Dwarf', persona: 'Sleepyhead', count: 22, table: [4, 7, 9, 11], color: '#c08457', glow: '#7a4a28', size: 0.9, set: 'full', blurb: 'Never quite managed to light up. Five more minutes, please.' },
  { id: 'orange-dwarf', name: 'Gnome Star', real: 'Orange Dwarf', persona: 'Garden gnome', count: 20, table: [4, 6, 8, 10], color: '#ff9a3c', glow: '#d0640a', size: 0.95, set: 'base', blurb: 'Pointy hat, kind heart, terrible jokes. Guards the lawn all night.' },
  { id: 'yellow-dwarf', name: 'Gold Star', real: 'Yellow Dwarf', persona: 'Teacher\'s pet', count: 18, table: [3, 6, 8, 9], color: '#ffd93d', glow: '#e0a800', size: 1, set: 'base', blurb: 'Top of the class and far too cheerful in the mornings. Would like a sticker.' },
  { id: 'white-dwarf', name: 'Silver Star', real: 'White Dwarf', persona: 'Retired old-timer', count: 16, table: [3, 5, 7, 8], color: '#e9f2ff', glow: '#8fb8e8', size: 0.85, set: 'base', blurb: 'Glowed for ten billion years and has the medal to prove it. Mostly naps and tells stories.' },
  { id: 'blue-giant', name: 'Track Star', real: 'Blue Giant', persona: 'Sweaty sprinter', count: 14, table: [3, 5, 6, 7], color: '#4aa8ff', glow: '#1c64c8', size: 1.25, set: 'base', blurb: 'Big, blue and always doing warm-ups. Keeps asking if you even jog.' },
  { id: 'stink-star', name: 'Stinky Star', real: 'gas giant, ish', persona: 'Resident farter', count: 12, table: [2, 4, 6, 8], color: '#a6c93a', glow: '#6f8f14', size: 1.05, set: 'base', blurb: 'A gas giant in every sense. Trails flies, clears rooms, says it was the dog.' },
  { id: 'red-giant', name: 'Hot Star', real: 'Red Giant', persona: 'Puffed-up hothead', count: 12, table: [2, 4, 6, 7], color: '#ff4766', glow: '#b8122f', size: 1.35, set: 'base', blurb: 'Swelling up, sweating buckets and about to eat a planet. Rather full of itself.' },
  { id: 'neutron-star', name: 'Super Star', real: 'Neutron Star', persona: 'Tiny strongman', count: 10, table: [2, 4, 5, 6], color: '#3fe0d0', glow: '#0d9c8e', size: 0.7, set: 'base', blurb: 'The size of a town, heavier than a mountain range. Never skips leg day.' },
  { id: 'pulsar', name: 'Pop Star', real: 'Pulsar', persona: 'Party DJ', count: 8, table: [2, 3, 4, 5], color: '#a66bff', glow: '#6a2fd6', size: 0.85, set: 'base', blurb: 'Spins and blinks all night long. The beat never drops.' },
  { id: 'quasar', name: 'Movie Star', real: 'Quasar', persona: 'Total show-off', count: 6, table: [null, 2, 3, null], color: '#ffe89a', glow: '#e8b400', size: 1, set: 'base', blurb: 'The brightest thing in the universe, and it will tell you so. Mind the paparazzi.' },
  { id: 'magnetar', name: 'Lodestar', real: 'Magnetar', persona: 'Very attractive', count: 4, table: [null, 2, 3, 4], color: '#ff6ec7', glow: '#d01f8a', size: 0.9, set: 'full', blurb: 'Everything sticks to it: spoons, keys, the odd spaceship.' },
];

const STAR_BY_ID = Object.fromEntries(STARS.map((s) => [s.id, s]));
const starDef = (id) => STAR_BY_ID[id] || null;

// 3-5 players use the nine "base" kinds (116 cards); 6-7 players (or a host who wants a bigger galaxy) use all twelve (166)
const BASE_SET = STARS.filter((s) => s.set === 'base').map((s) => s.id);
const FULL_SET = STARS.map((s) => s.id);

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 7;
const START_HAND = 5;
const DRAW_COUNT = 3;
const FACE_UP = 2;
const FIELD_PRICE = 3; // coins for a third patch
const MAX_OFFERS = 3; // open offers one person can have at a time

// the coins a patch of n stars of a kind pays when harvested
function payout(id, n) {
  const def = starDef(id);
  if (!def) return 0;
  let best = 0;
  def.table.forEach((need, i) => {
    if (need != null && n >= need) best = i + 1;
  });
  return best;
}

// how many more stars until the next payout (null if there is none)
function nextPayout(id, n) {
  const def = starDef(id);
  const have = payout(id, n);
  for (let i = have; i < def.table.length; i++) if (def.table[i] != null) return { stars: def.table[i], lumens: i + 1, more: def.table[i] - n };
  return null;
}

const PASSES = [
  { id: 1, name: 'Sprint', text: 'The game ends the first time the deck runs out' },
  { id: 2, name: 'Quick', text: 'The deck is reshuffled once' },
  { id: 3, name: 'Classic', text: 'The deck is reshuffled twice, like the real thing' },
];
const SPEEDS = ['chill', 'normal', 'quick'];

const AVATARS = ['🧑‍🚀', '👽', '🐮', '🐷', '🐔', '🐸', '🦙', '🐙', '🦊', '🐼', '🐨', '🦄'];
const BOT_AVATARS = ['🤖', '👾', '🐤', '🐞', '🦖', '🐌', '🐳'];
const EMOTES = ['😂', '😱', '👏', '🤩', '😈', '🤔', '😭', '🎉'];

// what the client needs to draw the game
const CLIENT_DATA = {
  stars: STARS,
  baseSet: BASE_SET,
  fullSet: FULL_SET,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  startHand: START_HAND,
  drawCount: DRAW_COUNT,
  faceUp: FACE_UP,
  fieldPrice: FIELD_PRICE,
  passes: PASSES,
  speeds: SPEEDS,
  emotes: EMOTES,
  deck: { base: STARS.filter((s) => s.set === 'base').reduce((n, s) => n + s.count, 0), full: STARS.reduce((n, s) => n + s.count, 0) },
};

module.exports = { STARS, STAR_BY_ID, starDef, BASE_SET, FULL_SET, MIN_PLAYERS, MAX_PLAYERS, START_HAND, DRAW_COUNT, FACE_UP, FIELD_PRICE, MAX_OFFERS, PASSES, SPEEDS, AVATARS, BOT_AVATARS, EMOTES, CLIENT_DATA, payout, nextPayout };
