// Star Charters: the numbers. Players, colours, how long a game is, what anomalies give, and the copy of the tiles
// the browser gets (/charters-data.json).

const { N, TILES, DEFS, START_TILE } = require('./tiles');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const PROBES = 7; // each captain's probes, plus one dreadnought (which counts twice)
const START_FUEL = 2; // thruster fuel: each one calls a probe home instead of sending one out
const MAX_FUEL = 4;

// a captain's colour: the probes, the score pip and the name tag
const COLOURS = [
  { id: 'red', name: 'Rocket Red', hex: '#e5484d' },
  { id: 'blue', name: 'Comet Blue', hex: '#3b7ff5' },
  { id: 'green', name: 'Martian Green', hex: '#25a55f' },
  { id: 'purple', name: 'Nebula Purple', hex: '#8e56d6' },
  { id: 'pink', name: 'Disco Pink', hex: '#f0559a' },
];
const AVATARS = ['🚀', '🛸', '🪐', '🌙', '☄️', '🛰️'];
const BOT_AVATARS = ['🤖', '👾', '🦾', '📡', '🧠'];
const EMOTES = ['😂', '😱', '👏', '🔥', '😈', '🤔', '😭', '🎉'];

// how long a game is: a Sprint takes about ten minutes, Classic is the full box
const LENGTHS = [
  { id: 'sprint', name: 'Sprint', text: `${DEFS.reduce((s, d) => s + d.sprint, 1)} tiles, about 10 minutes` },
  { id: 'classic', name: 'Classic', text: `${DEFS.reduce((s, d) => s + d.count, 1)} tiles, about 30 minutes` },
];
const SPEEDS = ['chill', 'normal', 'quick'];

// what is waiting out in the unknown: land a tile on one to get it
const ANOMALIES = {
  fuel: { name: 'Fuel cache', icon: '⛽', text: '+1 thruster fuel' },
  cache: { name: 'Treasure', icon: '💎', text: '+3 points' },
  boost: { name: 'Warp boost', icon: '⏩', text: 'Take another turn' },
};

// what the features are called, and what they score
const FEATURES = {
  L: { name: 'Warp Lane', icon: '🛣️', done: '1 per tile', open: '1 per tile' },
  S: { name: 'Station', icon: '🏙️', done: '2 per tile, +2 per reactor core', open: '1 per tile, +1 per core' },
  A: { name: 'Deep Space Array', icon: '📡', done: '9 when all 8 tiles round it are charted', open: '1, +1 per tile round it' },
  H: { name: 'Black Hole', icon: '🕳️', done: '9 when all 8 tiles round it are charted', open: '1, +1 per tile round it' },
  V: { name: 'Void', icon: '✨', done: '', open: '3 per finished station it touches (end of game)' },
};

const CLIENT_DATA = {
  n: N,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  probes: PROBES,
  startFuel: START_FUEL,
  colours: COLOURS,
  lengths: LENGTHS,
  speeds: SPEEDS,
  anomalies: ANOMALIES,
  features: FEATURES,
  emotes: EMOTES,
  start: START_TILE,
  // every tile, and how it looks turned each way round (its rows of letters, and its pieces)
  tiles: DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    count: d.count,
    sprint: d.sprint,
    pair: !!d.pair,
    uniq: TILES[d.id].uniq,
    shapes: TILES[d.id].shapes.map((s) => ({
      rows: s.rows,
      edges: s.edges.join(''),
      segAt: s.segAt.map((v) => (v < 0 ? '-' : String.fromCharCode(97 + v))).join(''),
      segs: s.segs.map((g) => ({ k: g.k, sides: g.sides, anchor: g.anchor, end: g.end || null, cores: g.cores, portal: g.portal })),
    })),
  })),
};

module.exports = { MIN_PLAYERS, MAX_PLAYERS, PROBES, START_FUEL, MAX_FUEL, COLOURS, AVATARS, BOT_AVATARS, EMOTES, LENGTHS, SPEEDS, ANOMALIES, FEATURES, CLIENT_DATA };
