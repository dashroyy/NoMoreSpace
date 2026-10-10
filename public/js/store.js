// Shared client state + the connection to the server.
/* global io */

export const socket = io({ transports: ['websocket', 'polling'] });

export const store = {
  data: null, // roles, cosmetics, tasks... from /game-data.json
  state: null, // latest game state from the server (personalised for us)
  prev: null, // the state before that (to spot changes)
  me: null, // our id
  clockOffset: 0, // server time - our time
  listeners: new Set(),
};

export function onState(fn) {
  store.listeners.add(fn);
}

export function serverNow() {
  return Date.now() + store.clockOffset;
}

// Send an event; resolves with the server's reply (or rejects with its error).
export function send(event, data = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (reply) => (reply?.ok ? resolve(reply) : reject(new Error(reply?.error || 'Failed'))));
  });
}

export function me() {
  return store.state?.you || null;
}

export function player(id) {
  return store.state?.players.find((p) => p.id === id) || null;
}

export function role(id) {
  return store.data?.roles[id] || null;
}

// The script (cast of characters) this ship is playing; before a ship exists, the classic one.
export function scriptInfo(id = store.state?.script) {
  return store.data?.scripts?.[id] || store.data?.scripts?.classic || { id: 'classic', name: 'Black Hole Blues', icon: '🕳️', minPlayers: 3, roles: Object.keys(store.data?.roles || {}), demons: ['parasite'], rules: [], blurb: '', tagline: '', theme: FALLBACK_THEME };
}

// The disaster the story is about (black hole, Great Grin...) and the words for it.
export function themeInfo(id = store.state?.script) {
  return scriptInfo(id).theme || FALLBACK_THEME;
}

const FALLBACK_THEME = {
  doom: 'the black hole', doomIcon: '🕳️', doomTip: 'How close the black hole is. It creeps closer every night and every death.',
  lurch: 'The ship lurches. The black hole is {pct}% of the way to swallowing us…',
  howTitle: '🕳️ No More Space', howIntro: 'Your ship is falling into a black hole.', evilGoal: 'The ship falls in. No more space.',
  nightSub: 'The ship sleeps. Something in the vents does not.',
  crewWinTitle: '🛡️ The crew escapes the black hole!', evilWinTitle: '🦑 The infiltrators win. No more space.',
  shareTitle: 'NO MORE SPACE', shareCrew: 'THE CREW ESCAPES!', shareEvil: 'NO MORE SPACE…',
  demonName: 'The Parasite', demonDoes: 'Every night it kills.',
  plants: 'Water the 6 wilting moon plants before the black hole dries them out.', jokes: [], rooms: {},
};

// The roles on that script, optionally just one type of them.
export function scriptRoleIds(type = null, id = store.state?.script) {
  const ids = scriptInfo(id).roles;
  return type ? ids.filter((r) => store.data.roles[r]?.type === type) : ids;
}

export function isCaptain() {
  return !!store.state?.you?.isCaptain;
}

export function isController() {
  return !!store.state?.you?.isController;
}

export function teamOfRole(roleId) {
  const r = role(roleId);
  return r ? store.data.types[r.type].team : null;
}

export function suitHex(p) {
  return store.data.suits[p?.cosmetics?.suit] || '#888888';
}

socket.on('state', (state, sentAt) => {
  if (sentAt) store.clockOffset = sentAt - Date.now();
  store.prev = store.state;
  store.state = state;
  if (state.you) store.me = state.you.id;
  for (const fn of store.listeners) {
    try {
      fn(state, store.prev);
    } catch (err) {
      console.error(err);
    }
  }
});
