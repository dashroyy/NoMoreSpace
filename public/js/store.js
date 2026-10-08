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
