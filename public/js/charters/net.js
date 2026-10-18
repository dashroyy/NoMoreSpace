// Star Charters: the connection to the server and the one copy of "what is going on".
/* global io */

export const socket = io('/charters', { transports: ['websocket', 'polling'] });

export const store = {
  data: null, // the tiles and the rules numbers, from /charters-data.json
  state: null, // the latest view from the server
  prev: null,
  me: null,
  clockOffset: 0,
};

const listeners = new Set();
export function onState(fn) {
  listeners.add(fn);
}

export const serverNow = () => Date.now() + store.clockOffset;

export function send(event, data = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (reply) => (reply?.ok ? resolve(reply) : reject(new Error(reply?.error || 'Failed'))));
  });
}

// the one thing a captain does: place a tile (and send a probe, or call one home)
export const act = (action) => send('act', action);

export async function loadData() {
  store.data = await fetch('/charters-data.json').then((r) => r.json());
  store.data.byId = Object.fromEntries(store.data.tiles.map((t) => [t.id, t]));
  return store.data;
}

socket.on('state', (state, sentAt) => {
  if (sentAt) store.clockOffset = sentAt - Date.now();
  store.prev = store.state;
  store.state = state;
  if (state.you) store.me = state.you.id;
  for (const fn of listeners) {
    try {
      fn(state, store.prev);
    } catch (err) {
      console.error(err);
    }
  }
});

export const tileDef = (id) => store.data?.byId[id] || null;
export const shapeOf = (id, r = 0) => tileDef(id)?.shapes[((r % 4) + 4) % 4] || null;
export const player = (id) => store.state?.players.find((p) => p.id === id) || null;
export const me = () => player(store.me);
export const colourOf = (pid) => {
  const p = player(pid);
  return store.data?.colours.find((c) => c.id === p?.colour)?.hex || '#888888';
};
export const colourHex = (id) => store.data?.colours.find((c) => c.id === id)?.hex || '#888888';
export const featureName = (k) => store.data?.features[k]?.name || '';
