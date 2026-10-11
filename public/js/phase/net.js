// Phase to Space: the connection to the server and the one copy of "what is going on".
/* global io */

export const socket = io('/phase', { transports: ['websocket', 'polling'] });

export const store = {
  data: null, // every card, from /phase-data.json
  defs: {}, // card id -> definition
  state: null, // the latest view from the server (personalised: only our own hand is in it)
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
  const data = await fetch('/phase-data.json').then((r) => r.json());
  store.data = data;
  for (const list of [data.captains, data.crew, data.gear, data.protocols, data.boosts, [data.challenge], data.beasts]) for (const c of list) store.defs[c.id] = c;
  return data;
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

export const def = (id) => store.defs[id];
export const player = (id) => store.state?.players.find((p) => p.id === id) || null;
export const me = () => player(store.me);
export const classInfo = (id) => store.data.classes[id];
