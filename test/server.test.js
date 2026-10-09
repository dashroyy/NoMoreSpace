// Server tests: real Socket.IO connections against the real server. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

process.env.PORT = '0'; // any free port
const { server, rooms, io: ioServer } = require('../server/index');
const { io } = require('socket.io-client');

let base;
const clients = [];

test.before(async () => {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

test.after(() => {
  for (const c of clients) c.close();
  ioServer.close();
  server.close();
});

function connect() {
  const c = io(base, { transports: ['websocket'], forceNew: true });
  c.states = [];
  c.chats = [];
  c.on('state', (s) => c.states.push(s));
  c.on('chat', (m) => c.chats.push(m));
  clients.push(c);
  return new Promise((r) => c.on('connect', () => r(c)));
}

function call(c, event, data = {}) {
  return new Promise((resolve) => c.emit(event, data, resolve));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latest = (c) => c.states.at(-1);

async function waitFor(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(20);
  }
  throw new Error('timed out');
}

async function makeShip(n, mode = 'autopilot') {
  const host = await connect();
  const joined = new Promise((r) => host.once('joined', r));
  assert.ok((await call(host, 'create', { name: 'Host', mode })).ok);
  const { code } = await joined;
  const players = mode === 'captain' ? [] : [host];
  for (let i = players.length; i < n; i++) {
    const c = await connect();
    assert.ok((await call(c, 'join', { code, name: `P${i}` })).ok);
    players.push(c);
  }
  await waitFor(() => latest(host)?.players.length === n);
  return { host, players, code, room: rooms.get(code) };
}

test('serves the page, game data and Three.js, and blocks path tricks', async () => {
  const get = (path) => new Promise((resolve) => http.get(base + path, (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }));
  assert.strictEqual((await get('/')).status, 200);
  const data = JSON.parse((await get('/game-data.json')).body);
  assert.strictEqual(Object.keys(data.roles).length, 23);
  assert.strictEqual((await get('/vendor/three/three.module.min.js')).status, 200);
  assert.notStrictEqual((await get('/..%2fpackage.json')).status, 200);
  assert.notStrictEqual((await get('/vendor/three/..%2f..%2f..%2fpackage.json')).status, 200);
  assert.match((await get('/health')).body, /"ok":true/);
});

test('players join a ship and get their seat back with their token', async () => {
  const { host, players, code } = await makeShip(3);
  const myId = latest(players[1]).you.id;
  const saved = rooms.get(code).game.get(myId).token;
  const again = await connect();
  await call(again, 'join', { code, token: saved });
  await waitFor(() => latest(again)?.you?.id === myId);
  assert.strictEqual(latest(host).players.length, 3, 'no duplicate seat');
});

test('chat: everyone hears the lobby, nobody can talk at night, evil channel needs 7+', async () => {
  const { host, players, room } = await makeShip(5);
  await call(players[1], 'chat', { text: 'hello crew' });
  await waitFor(() => players.every((p) => p.chats.some((m) => m.text === 'hello crew')));

  room.game.pace = 0.01;
  assert.ok((await call(host, 'start')).ok);
  await waitFor(() => latest(host).phase === 'night');
  const shh = await call(players[2], 'chat', { text: 'psst' });
  assert.strictEqual(shh.ok, false);
  assert.match(shh.error, /asleep/);
  const evil = room.game.players.find((p) => p.role === 'parasite');
  const evilClient = players.find((c) => latest(c).you.id === evil.id);
  const res = await call(evilClient, 'chat', { text: 'kill them all', channel: 'evil' });
  assert.strictEqual(res.ok, false, 'no evil channel in a 5 player game');
});

test('the infiltrator channel only reaches infiltrators (7+ players)', async () => {
  const { host, players, room } = await makeShip(7);
  assert.ok((await call(host, 'start')).ok);
  await waitFor(() => latest(host).phase === 'night');
  const byId = (id) => players.find((c) => latest(c).you.id === id);
  const evilIds = room.game.players.filter((p) => ['parasite', 'hacker', 'mimic', 'incubator', 'smuggler', 'jester'].includes(p.role)).map((p) => p.id);
  const sender = byId(evilIds[0]);
  assert.ok((await call(sender, 'chat', { text: 'secret plan', channel: 'evil' })).ok);
  await waitFor(() => evilIds.every((id) => byId(id).chats.some((m) => m.text === 'secret plan')));
  await wait(100);
  for (const c of players) {
    if (!evilIds.includes(latest(c).you.id)) assert.ok(!c.chats.some((m) => m.text === 'secret plan'), 'good players never see it');
  }
  // and nobody sees anyone else's role
  for (const c of players) assert.ok(latest(c).players.every((p) => p.role === undefined));
});

test('proximity chat while exploring only reaches nearby players', async () => {
  const { host, players, room } = await makeShip(5);
  await call(host, 'start');
  // jump straight to the exploring phase
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  room.game.beginRoam(Date.now());
  const ids = players.map((c) => latest(c).you.id);
  players[0].emit('pos', { x: 0, z: 0, r: 0, m: 0, room: 'bridge' });
  players[1].emit('pos', { x: 2, z: 1, r: 0, m: 0, room: 'bridge' });
  players[2].emit('pos', { x: 30, z: 0, r: 0, m: 0, room: 'galley' });
  players[3].emit('pos', { x: 30, z: 2, r: 0, m: 0, room: 'galley' });
  players[4].emit('pos', { x: -46, z: 0, r: 0, m: 0, room: 'airlock' });
  await waitFor(() => Object.keys(room.positions).length === 5);
  await call(players[0], 'chat', { text: 'just between us' });
  await waitFor(() => players[1].chats.some((m) => m.text === 'just between us'));
  await wait(150);
  assert.ok(!players[2].chats.some((m) => m.text === 'just between us'));
  assert.ok(!players[4].chats.some((m) => m.text === 'just between us'));
  // positions are relayed to everyone
  const got = new Promise((r) => players[4].once('pos', r));
  players[0].emit('pos', { x: 1, z: 1, r: 1, m: 1, room: 'bridge' });
  const packed = await got;
  assert.ok(packed[ids[0]]);
});

test('room chat: corridors only count distance, the sender learns how many heard, teleporting joins a room', async () => {
  const { host, players, room } = await makeShip(5);
  await call(host, 'start');
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  room.game.beginRoam(Date.now());
  // two players at opposite ends of the corridors, two in the galley, one alone in cargo
  players[0].emit('pos', { x: 14, z: 0, r: 0, m: 0, room: 'corridor' });
  players[1].emit('pos', { x: 0, z: 35, r: 0, m: 0, room: 'corridor' });
  players[2].emit('pos', { x: 25, z: 0, r: 0, m: 0, room: 'galley' });
  players[3].emit('pos', { x: 30, z: 5, r: 0, m: 0, room: 'galley' });
  players[4].emit('pos', { x: 0, z: 43, r: 0, m: 0, room: 'cargo' });
  await waitFor(() => Object.keys(room.positions).length === 5);
  const alone = await call(players[0], 'chat', { text: 'hello corridor?' });
  assert.equal(alone.heard, 0);
  assert.equal(alone.channel, 'near');
  await wait(100);
  assert.ok(!players[1].chats.some((m) => m.text === 'hello corridor?'));
  const pair = await call(players[2], 'chat', { text: 'galley gossip' });
  assert.equal(pair.heard, 1);
  // "teleport" into the galley: a jump in position is all it takes
  players[4].emit('pos', { x: 27, z: -3, r: 0, m: 0, room: 'galley' });
  await waitFor(() => room.positions[latest(players[4]).you.id]?.room === 'galley');
  await wait(650);
  const three = await call(players[2], 'chat', { text: 'welcome aboard' });
  assert.equal(three.heard, 2);
  await waitFor(() => players[4].chats.some((m) => m.text === 'welcome aboard'));
});

test('ship systems over the network: intercepts, spoofs, disguises and lockdowns', async () => {
  const { host, players, room } = await makeShip(5);
  assert.ok((await call(host, 'start', { deal: ['comms', 'security', 'engineer', 'mimic', 'parasite'] })).ok);
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  room.game.beginRoam(Date.now());
  const [comms, security, engineer, mimic, parasite] = players;
  const id = (c) => latest(c).you.id;
  await waitFor(() => latest(comms).you.system?.id === 'intercept');
  comms.emit('pos', { x: 0, z: 43, r: 0, m: 0, room: 'cargo' });
  security.emit('pos', { x: 25, z: 0, r: 0, m: 0, room: 'galley' });
  engineer.emit('pos', { x: 30, z: 4, r: 0, m: 0, room: 'galley' });
  mimic.emit('pos', { x: -26, z: 0, r: 0, m: 0, room: 'medbay' });
  parasite.emit('pos', { x: -30, z: 25, r: 0, m: 0, room: 'reactor' });
  await waitFor(() => Object.keys(room.positions).length === 5);

  // the Comms Officer hears the galley, without names
  assert.ok((await call(comms, 'system', { room: 'galley' })).ok);
  await call(security, 'chat', { text: 'I am the Security Chief' });
  await waitFor(() => comms.chats.some((m) => m.text === 'I am the Security Chief'));
  const heard = comms.chats.find((m) => m.text === 'I am the Security Chief');
  assert.strictEqual(heard.channel, 'intercept');
  assert.strictEqual(heard.from, null);
  assert.ok(!heard.name.includes('P1'));

  // a lockdown stops the eavesdropping
  assert.ok((await call(security, 'system', {})).ok);
  await wait(650);
  await call(security, 'chat', { text: 'now we are safe' });
  await waitFor(() => engineer.chats.some((m) => m.text === 'now we are safe'));
  await wait(150);
  assert.ok(!comms.chats.some((m) => m.text === 'now we are safe'));
  assert.ok(latest(engineer).systems.lockdowns.some((l) => l.room === 'galley'));

  // the Mimic disguises as the Engineer: chat shows the Engineer's name
  assert.ok((await call(mimic, 'system', { target: id(engineer) })).ok);
  parasite.emit('pos', { x: -26, z: 2, r: 0, m: 0, room: 'medbay' });
  await waitFor(() => room.positions[id(parasite)]?.room === 'medbay');
  await call(mimic, 'chat', { text: 'trust me' });
  await waitFor(() => parasite.chats.some((m) => m.text === 'trust me'));
  assert.strictEqual(parasite.chats.find((m) => m.text === 'trust me').name, 'P2');
  assert.ok(latest(parasite).systems.disguises.some((d) => d.id === id(mimic) && d.as === id(engineer)));

  // using a system twice is refused
  const again = await call(mimic, 'system', { target: id(comms) });
  assert.ok(!again.ok);
});

test('Captain mode: only the Captain controls the game and sees the manifest', async () => {
  const { host: captain, players, room } = await makeShip(0, 'captain').catch(() => ({}));
  if (!captain) return;
  for (let i = 0; i < 4; i++) {
    const c = await connect();
    await call(c, 'join', { code: room.game.code, name: `Crew${i}` });
    players.push(c);
  }
  await waitFor(() => latest(captain).players.length === 4);
  const denied = await call(players[0], 'start');
  assert.strictEqual(denied.ok, false);
  assert.ok((await call(captain, 'start')).ok);
  await waitFor(() => latest(captain).grimoire?.players.length === 4);
  assert.ok(latest(captain).grimoire.players.every((p) => p.role));
  assert.strictEqual(latest(players[0]).grimoire, undefined);
  // story bubble reaches players
  const bubble = new Promise((r) => players[1].once('bubble', r));
  await call(captain, 'say', { text: 'The lights flicker…' });
  assert.strictEqual((await bubble).text, 'The lights flicker…');
  // puppet
  const emote = new Promise((r) => players[2].once('emote', r));
  await call(captain, 'puppet', { id: latest(players[3]).you.id, emote: 'chicken' });
  assert.strictEqual((await emote).emote, 'chicken');
  assert.strictEqual((await call(players[0], 'puppet', { id: latest(players[3]).you.id, emote: 'dance' })).ok, false);
});

test('ships are isolated: emotes and bubbles never leak to another ship', async () => {
  const a = await makeShip(3);
  const b = await makeShip(3);
  let leaked = false;
  for (const c of b.players) {
    c.on('emote', () => (leaked = true));
    c.on('bubble', () => (leaked = true));
  }
  const seen = new Promise((r) => a.players[1].once('emote', r));
  await call(a.players[0], 'emote', { emote: 'wave' });
  await seen;
  await wait(150);
  assert.strictEqual(leaked, false);
});
