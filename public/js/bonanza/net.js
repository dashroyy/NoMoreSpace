// Star Bonanza: the connection to the server and the one copy of "what is going on".
/* global io */

export const socket = io('/bonanza', { transports: ['websocket', 'polling'] });

export const store = {
  data: null, // the stars and the rules numbers, from /bonanza-data.json
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

// everything a player does in the game (plant, harvest, offer...) goes through one event
export const act = (action) => send('act', action);

export async function loadData() {
  store.data = await fetch('/bonanza-data.json').then((r) => r.json());
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

export const star = (id) => store.data?.stars.find((s) => s.id === id) || null;
export const player = (id) => store.state?.players.find((p) => p.id === id) || null;
export const me = () => player(store.me);

// the lumens a nursery of n stars pays, and how many more it needs for the next lumen
export function payout(id, n) {
  const d = star(id);
  if (!d) return 0;
  let best = 0;
  d.table.forEach((need, i) => {
    if (need != null && n >= need) best = i + 1;
  });
  return best;
}
export function nextPayout(id, n) {
  const d = star(id);
  if (!d) return null;
  for (let i = payout(id, n); i < d.table.length; i++) if (d.table[i] != null) return { stars: d.table[i], lumens: i + 1, more: d.table[i] - n };
  return null;
}
