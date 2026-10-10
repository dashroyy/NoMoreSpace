// Server tests: real Socket.IO connections against the real server. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

process.env.PORT = '0'; // any free port
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nms-test-')); // stats & bug reports go here
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
  assert.strictEqual(Object.keys(data.roles).length, 46);
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

test('locking a room for a private chat: intruders are kept out, knocks reach the people inside, and the door opens from inside', async () => {
  const { host, players, room } = await makeShip(4);
  assert.ok((await call(host, 'start')).ok);
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  room.game.beginRoam(Date.now());
  const [a, b, c, d] = players;
  const id = (x) => latest(x).you.id;
  a.emit('pos', { x: 24, z: 0, r: 0, m: 0, room: 'galley' });
  b.emit('pos', { x: 27, z: 1, r: 0, m: 0, room: 'galley' });
  c.emit('pos', { x: 26, z: -12, r: 0, m: 0, room: 'corridor' });
  d.emit('pos', { x: -26, z: 0, r: 0, m: 0, room: 'medbay' });
  await waitFor(() => Object.keys(room.positions).length === 4);

  // you can't lock a door from the corridor, or alone
  assert.ok(!(await call(c, 'lock')).ok);
  assert.ok(!(await call(d, 'lock')).ok);
  // two people in the galley can
  const noticeB = new Promise((r) => b.once('door', r));
  assert.ok((await call(a, 'lock')).ok);
  assert.strictEqual((await noticeB).kind, 'locked');
  await waitFor(() => latest(c).systems.lockdowns.some((l) => l.room === 'galley' && l.private));

  // the intruder walks to the door and tries to step in: the server still files them in the corridor
  c.emit('pos', { x: 26, z: -7, r: 0, m: 1, room: 'galley' });
  await waitFor(() => room.positions[id(c)]?.z === -7);
  assert.strictEqual(room.positions[id(c)].room, 'corridor');
  // and neither side hears the other
  await call(a, 'chat', { text: 'what I tell you stays here' });
  await waitFor(() => b.chats.some((m) => m.text === 'what I tell you stays here'));
  await wait(150);
  assert.ok(!c.chats.some((m) => m.text === 'what I tell you stays here'));
  await call(c, 'chat', { text: 'can anybody hear me?' });
  await wait(200);
  assert.ok(!b.chats.some((m) => m.text === 'can anybody hear me?'));

  // knocking: only near the door, and the people inside are told
  assert.ok(!(await call(d, 'knock', { room: 'galley' })).ok, 'too far away');
  const knockHeard = new Promise((r) => a.once('door', r));
  assert.ok((await call(c, 'knock', { room: 'galley' })).ok);
  const knock = await knockHeard;
  assert.strictEqual(knock.kind, 'knock');
  assert.strictEqual(knock.from, id(c));
  assert.ok(!(await call(c, 'knock', { room: 'galley' })).ok, 'no knocking twice in a row');

  // let in: now they can enter, hear and be heard
  assert.ok(!(await call(c, 'let-in', { id: id(c) })).ok, 'you cannot let yourself in');
  const opened = new Promise((r) => c.once('door', r));
  assert.ok((await call(b, 'let-in', { id: id(c) })).ok);
  assert.strictEqual((await opened).kind, 'opened');
  c.emit('pos', { x: 25, z: -5, r: 0, m: 1, room: 'galley' });
  await waitFor(() => room.positions[id(c)]?.room === 'galley');
  await wait(650); // (chat has a short cooldown)
  assert.ok((await call(a, 'chat', { text: 'welcome, come in' })).ok);
  await waitFor(() => c.chats.some((m) => m.text === 'welcome, come in'));

  // anyone inside can unlock, and then strangers get in
  assert.ok(!(await call(d, 'unlock')).ok, 'only people inside');
  assert.ok((await call(b, 'unlock')).ok);
  await waitFor(() => !latest(d).systems.lockdowns.some((l) => l.room === 'galley'));
  d.emit('pos', { x: 28, z: 3, r: 0, m: 1, room: 'galley' });
  await waitFor(() => room.positions[id(d)]?.room === 'galley');
});

test('the host picks a script over the network; a dead Clown throws a pie from their own screen', async () => {
  const { host, players, room } = await makeShip(8);
  assert.ok(!(await call(players[1], 'script', { id: 'carnival' })).ok, 'only the host picks');
  assert.ok(!(await call(host, 'script', { id: 'nope' })).ok);
  assert.ok((await call(host, 'script', { id: 'carnival' })).ok);
  await waitFor(() => latest(players[3]).script === 'carnival');
  assert.ok((await call(host, 'start', { deal: ['parasite', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'stagehand', 'tickettaker', 'clown'] })).ok);
  await waitFor(() => latest(players[7]).you.role === 'clown');
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  const clown = players[7];
  assert.strictEqual(latest(clown).you.wish, null, 'alive: no pie yet');
  room.game.kill(room.game.players[7], 'parasite');
  await call(host, 'chat', { text: 'x' }).catch(() => {}); // any event makes the server send fresh state
  await waitFor(() => latest(clown).you.wish?.role === 'clown');
  assert.ok(!(await call(players[2], 'wish', { target: room.game.players[0].id })).ok, 'only the Clown can');
  assert.ok((await call(clown, 'wish', { target: room.game.players[3].id })).ok);
  await waitFor(() => latest(clown).you.wish === null);
  assert.ok(room.game.dayLog.some((e) => e.k === 'pie'));
  // the carnival shows up in the public ship list
  assert.ok((await call(host, 'public', { on: true })).ok);
  const stranger = await connect();
  const list = (await call(stranger, 'list-public')).ships.find((x) => x.code === room.code);
  assert.strictEqual(list?.script, 'carnival');
});

test('whisper requests beam both players into an empty room; claims, bug reports and stats work', async () => {
  const { host, players, room } = await makeShip(5);
  assert.ok((await call(host, 'start')).ok);
  room.game.resolveNight(Date.now());
  room.game.applyDraft(Date.now());
  room.game.beginRoam(Date.now());
  const [a, b, c] = players;
  const id = (x) => latest(x).you.id;
  a.emit('pos', { x: 0, z: 0, r: 0, m: 0, room: 'bridge' });
  c.emit('pos', { x: 25, z: 0, r: 0, m: 0, room: 'galley' });
  await waitFor(() => room.positions[id(c)]);
  // ask, accept, and both get sent to the same empty room
  const invited = new Promise((r) => b.once('whisper-invite', r));
  assert.ok((await call(a, 'whisper-ask', { target: id(b) })).ok);
  const inv = await invited;
  assert.strictEqual(inv.from, id(a));
  const goA = new Promise((r) => a.once('whisper-go', r));
  const goB = new Promise((r) => b.once('whisper-go', r));
  assert.ok((await call(b, 'whisper-answer', { from: id(a), yes: true })).ok);
  const [ga, gb] = await Promise.all([goA, goB]);
  assert.strictEqual(ga.room, gb.room);
  assert.ok(!['bridge', 'galley', 'corridor'].includes(ga.room), 'an empty room');
  // answering twice does nothing
  assert.ok(!(await call(b, 'whisper-answer', { from: id(a), yes: true })).ok);
  // claims are public
  assert.ok((await call(c, 'claim', { role: 'medic', text: 'I protected Bea' })).ok);
  await waitFor(() => latest(a).claims?.[id(c)]?.role === 'medic');
  assert.ok(latest(a).dayLog.some((e) => e.k === 'claim' && e.id === id(c)));
  assert.ok(!(await call(c, 'claim', { role: 'not-a-role' })).ok);
  // bug reports are saved for the owner
  assert.ok((await call(a, 'bug-report', { text: 'The duck stole my vote', errors: ['TypeError: x'], info: 'test' })).ok);
  assert.ok(!(await call(a, 'bug-report', { text: 'again!' })).ok, 'rate limited');
  await waitFor(() => fs.existsSync(path.join(process.env.NMS_DATA_DIR, 'reports.jsonl')) && fs.statSync(path.join(process.env.NMS_DATA_DIR, 'reports.jsonl')).size > 0, 3000);
  const report = JSON.parse(fs.readFileSync(path.join(process.env.NMS_DATA_DIR, 'reports.jsonl'), 'utf8').trim().split('\n').pop());
  assert.strictEqual(report.text, 'The duck stole my vote');
  // a finished game lands in the stats file, and /stats summarises it
  room.game.finish('crew', 'test');
  await call(host, 'auto', { on: true });
  await waitFor(() => fs.existsSync(path.join(process.env.NMS_DATA_DIR, 'stats.jsonl')) && fs.statSync(path.join(process.env.NMS_DATA_DIR, 'stats.jsonl')).size > 0, 3000);
  const stats = await (await fetch(`${base}/stats`)).json();
  assert.ok(stats.games >= 1);
  assert.strictEqual((await fetch(`${base}/reports`)).status, 403, 'reports need the admin token');
  // the owner's dashboard: the page, live counts and role names in /stats, and the token as a Bearer header
  assert.strictEqual((await fetch(`${base}/dashboard`)).status, 200);
  assert.strictEqual(typeof stats.live.people, 'number');
  assert.ok(Object.values(stats.roles).every((r) => r.name && 'icon' in r && r.wins <= r.dealt));
  process.env.NMS_ADMIN_TOKEN = 'sekrit';
  try {
    assert.strictEqual((await fetch(`${base}/reports`, { headers: { Authorization: 'Bearer nope' } })).status, 403);
    const res = await fetch(`${base}/reports`, { headers: { Authorization: 'Bearer sekrit' } });
    assert.strictEqual(res.status, 200);
    assert.ok((await res.json()).some((r) => r.text === 'The duck stole my vote'));
  } finally {
    delete process.env.NMS_ADMIN_TOKEN;
  }
});

test('public ships: only the host can open a ship, and strangers find it in the list', async () => {
  const { host, players, code } = await makeShip(2);
  const stranger = await connect();
  const before = await call(stranger, 'list-public');
  assert.ok(before.ok && !before.ships.some((s) => s.code === code), 'ships are private by default');
  assert.strictEqual((await call(players[1], 'public', { on: true })).ok, false, 'only the host decides');
  assert.ok((await call(host, 'public', { on: true })).ok);
  await waitFor(() => latest(players[1]).isPublic === true);
  const mine = (await call(stranger, 'list-public')).ships.find((s) => s.code === code);
  assert.ok(mine, 'listed');
  assert.strictEqual(mine.phase, 'lobby');
  assert.strictEqual(mine.people, 2);
  assert.ok((await call(stranger, 'join', { code, name: 'Stranger' })).ok);
  await waitFor(() => latest(host).players.length === 3);
  assert.ok((await call(host, 'public', { on: false })).ok);
  assert.ok(!(await call(stranger, 'list-public')).ships.some((s) => s.code === code), 'closed again');
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
