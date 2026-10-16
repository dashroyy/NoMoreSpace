// Star Bonanza: everything in the game that is not a rule. The eleven kinds of star (the "beans"), how many of each
// are in the deck, and how many stars of a kind you need to harvest for 1, 2, 3 or 4 lumens (the "beanometer").
//
// The game is an original, space-themed remake of the planting, trading and harvesting card game Bohnanza (Uwe
// Rosenberg, 1997). Mechanics are not owned by anyone; the names, the art and the story here are our own. The card
// counts and the payout table are the real game's, since that balance has had twenty-five years of testing:
// the more of a kind in the deck, the more of them you need for each lumen.

// stars: how many in the deck, `table` = stars needed for 1, 2, 3, 4 lumens (null = that payout does not exist)
const STARS = [
  { id: 'red-dwarf', name: 'Red Dwarf', cls: 'M', count: 24, table: [4, 7, 10, 12], color: '#ff6a4d', glow: '#ff3b1f', size: 0.5, set: 'full', blurb: 'Small, cool and absolutely everywhere.' },
  { id: 'brown-dwarf', name: 'Brown Dwarf', cls: 'L', count: 22, table: [4, 7, 9, 11], color: '#c0794a', glow: '#8a4a26', size: 0.45, set: 'full', blurb: 'A star that never quite managed to light up.' },
  { id: 'orange-dwarf', name: 'Orange Dwarf', cls: 'K', count: 20, table: [4, 6, 8, 10], color: '#ffa63d', glow: '#ff7a00', size: 0.6, set: 'base', blurb: 'Calm, long-lived and quietly reliable.' },
  { id: 'yellow-dwarf', name: 'Yellow Dwarf', cls: 'G', count: 18, table: [3, 6, 8, 9], color: '#ffe14d', glow: '#ffc400', size: 0.7, set: 'base', blurb: 'A cheerful sunny star, just like home.' },
  { id: 'white-dwarf', name: 'White Dwarf', cls: 'D', count: 16, table: [3, 5, 7, 8], color: '#eaf4ff', glow: '#9fd0ff', size: 0.38, set: 'base', blurb: 'The glowing ember of a star that lived well.' },
  { id: 'blue-giant', name: 'Blue Giant', cls: 'B', count: 14, table: [3, 5, 6, 7], color: '#5aa7ff', glow: '#1f6bff', size: 1.0, set: 'base', blurb: 'Hot, bright and extremely full of itself.' },
  { id: 'red-giant', name: 'Red Giant', cls: 'RG', count: 12, table: [2, 4, 6, 7], color: '#ff4a3a', glow: '#d81b0e', size: 1.3, set: 'base', blurb: 'Swollen, glowing and swallowing its planets.' },
  { id: 'neutron-star', name: 'Neutron Star', cls: 'NS', count: 10, table: [2, 4, 5, 6], color: '#9ff0ff', glow: '#3fd0ff', size: 0.3, set: 'base', blurb: 'A city-sized ball heavier than a mountain range.' },
  { id: 'pulsar', name: 'Pulsar', cls: 'P', count: 8, table: [2, 3, 4, 5], color: '#c985ff', glow: '#9a3dff', size: 0.35, set: 'base', blurb: 'A spinning lighthouse that blinks at the galaxy.' },
  { id: 'quasar', name: 'Quasar', cls: 'Q', count: 6, table: [null, 2, 3, null], color: '#ffffff', glow: '#b8f0ff', size: 0.8, set: 'base', blurb: 'The brightest thing there is. It is showing off.' },
  { id: 'magnetar', name: 'Magnetar', cls: 'MG', count: 4, table: [null, 2, 3, 4], color: '#ff5fb0', glow: '#ff1f8e', size: 0.4, set: 'full', blurb: 'The strongest magnet in the universe. Do not bring a watch.' },
];

const STAR_BY_ID = Object.fromEntries(STARS.map((s) => [s.id, s]));
const starDef = (id) => STAR_BY_ID[id] || null;

// 3-5 players use the eight "base" kinds (104 cards); 6-7 players (or a host who wants a bigger galaxy) use all eleven (154)
const BASE_SET = STARS.filter((s) => s.set === 'base').map((s) => s.id);
const FULL_SET = STARS.map((s) => s.id);

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 7;
const START_HAND = 5;
const DRAW_COUNT = 3;
const FACE_UP = 2;
const FIELD_PRICE = 3; // lumens for a third nursery
const MAX_OFFERS = 3; // open offers one person can have at a time

// the lumens a field of n stars of a kind pays when harvested
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

const AVATARS = ['🧑‍🚀', '👩‍🚀', '🛸', '🪐', '☄️', '🌟', '🚀', '👽', '🤖', '🌌', '🔭', '🛰️'];
const BOT_AVATARS = ['🤖', '👾', '🛸', '🦾', '🪐', '☄️', '🔭'];
const EMOTES = ['😂', '😱', '👏', '🔥', '😈', '🤔', '😭', '🎉'];

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
