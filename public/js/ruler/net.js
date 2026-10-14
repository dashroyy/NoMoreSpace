// Ruler of the Galaxy: the connection to the server and the one copy of "what is going on".
/* global io */

export const socket = io('/ruler', { transports: ['websocket', 'polling'] });

export const store = {
  data: null, // contenders, cards and anomalies, from /ruler-data.json
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

export async function loadData() {
  store.data = await fetch('/ruler-data.json').then((r) => r.json());
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

export const contender = (id) => store.data?.contenders.find((c) => c.id === id) || null;
export const card = (id) => store.data?.cards.find((c) => c.id === id) || null;
export const anomaly = (id) => store.data?.anomalies.find((a) => a.id === id) || null;
export const evolution = (id) => {
  for (const c of store.data?.contenders || []) {
    const e = c.evolutions.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
};
export const player = (id) => store.state?.players.find((p) => p.id === id) || null;
export const me = () => player(store.me);
export const colorOf = (p) => contender(p?.contender)?.color || '#8fb2ff';
