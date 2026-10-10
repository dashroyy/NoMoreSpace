// The web server. It:
//   1. Sends the game files (public/ and the Three.js 3D library) to browsers.
//   2. Keeps a live Socket.IO connection with every player, so moves, chat,
//      votes and phase changes show up instantly for everyone.
// All the game rules live in engine.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Game, DEATH_ANIMS, ROOM_NAMES, HAUNTS, REACTIONS, HAUNTS_PER_DAY } = require('./engine');
const { ROLES, TYPES, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, EVIL_INFO_MIN, teamOf } = require('./roles');
const cosmetics = require('./cosmetics');
const { TASKS } = require('./tasks');
const qrcode = require('qrcode-generator');
const records = require('./records');
const persist = require('./persist');
const { runBots, ROOM_RECTS } = require('./bots');
const crypto = require('crypto');

const PORT = process.env.PORT != null ? Number(process.env.PORT) : 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three', 'build');
const MAX_ROOMS = 150;
const NEAR_RADIUS = 7; // proximity chat distance (players in the same room always hear each other)
const ROOM_IDS = ['bridge', 'observation', 'navigation', 'comms', 'medbay', 'galley', 'reactor', 'engine', 'hydroponics', 'airlock', 'quarters', 'cargo', 'corridor'];
const PLAYER_EMOTES = ['wave', 'dance', 'scooby', 'scuba', 'jump', 'spin', 'shrug', 'point', 'cry', 'laugh'];
const STINGERS = ['trombone', 'drumroll', 'airhorn', 'crickets', 'kazoo', 'gasp'];
const CAPTAIN_EMOTES = [...PLAYER_EMOTES, 'faint', 'shiver', 'flail', 'grow', 'shrink', 'chicken', 'sneeze', 'moonwalk', 'levitate', 'confetti', 'zap'];

// Voice chat needs STUN (free, public) and optionally a TURN relay for strict networks.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL) {
  ICE_SERVERS.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
}

const GAME_DATA = JSON.stringify({
  roles: ROLES,
  types: TYPES,
  distribution: DISTRIBUTION,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  evilInfoMin: EVIL_INFO_MIN,
  suits: cosmetics.SUITS,
  hats: cosmetics.HATS,
  visors: cosmetics.VISORS,
  pets: cosmetics.PETS,
  tasks: TASKS,
  deathAnims: DEATH_ANIMS,
  playerEmotes: PLAYER_EMOTES,
  captainEmotes: CAPTAIN_EMOTES,
  iceServers: ICE_SERVERS,
  haunts: HAUNTS,
  hauntsPerDay: HAUNTS_PER_DAY,
  reactions: REACTIONS,
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// 1. Files
// ---------------------------------------------------------------------------

function sendFile(res, baseDir, relative, cache) {
  const filePath = path.normalize(path.join(baseDir, relative));
  if (!filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  // play stats for balancing (no names), and bug reports for the owner
  // the owner's dashboard: a readable page over /stats (and /reports with the admin token)
  if (url.pathname === '/dashboard') {
    sendFile(res, PUBLIC_DIR, 'dashboard.html', 'no-cache');
    return;
  }
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    const live = [...rooms.values()];
    res.end(JSON.stringify({
      ...records.statsSummary(),
      live: { ships: live.length, people: live.reduce((n, r) => n + r.game.players.filter((p) => p.connected && !p.isBot).length, 0), playing: live.filter((r) => !['lobby', 'ended'].includes(r.game.phase)).length },
    }, null, 2));
    return;
  }
  if (url.pathname === '/reports') {
    const token = process.env.NMS_ADMIN_TOKEN;
    // the token can come as ?token=... or (from the dashboard, kept out of server logs) an Authorization: Bearer header
    const given = url.searchParams.get('token') || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || given !== token) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Set NMS_ADMIN_TOKEN on the server and pass ?token=... (or read data/reports.jsonl).');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(records.reports(), null, 2));
    return;
  }
  // A finished game's replay (see records.saveReplay).
  const replay = url.pathname.match(/^\/replay\/([a-f0-9]{12})\.json$/);
  if (replay) {
    const json = records.readReplay(replay[1]);
    res.writeHead(json ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    res.end(json || '{"error":"No replay with that id (replays are kept for the last 500 games)."}');
    return;
  }
  // The deploy script calls this (from the server itself) before restarting, so players get a warning.
  if (url.pathname === '/internal/restart-warning' && req.method === 'POST') {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
    if (!local) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const seconds = Math.max(5, Math.min(60, Number(url.searchParams.get('seconds')) || 20));
    io.emit('server-restart', { in: seconds });
    res.writeHead(200).end('warned');
    return;
  }
  // A QR code for the lobby, so friends on the same call can join from their phones.
  if (url.pathname === '/qr.svg') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      res.writeHead(400).end('Bad code');
      return;
    }
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = String(req.headers.host || 'localhost').replace(/[^\w.:\-\[\]]/g, '');
    const qr = qrcode(0, 'M');
    qr.addData(`${proto}://${host}/?join=${code}`);
    qr.make();
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
    res.end(qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true }));
    return;
  }
  if (url.pathname === '/game-data.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(GAME_DATA);
    return;
  }
  if (url.pathname.startsWith('/vendor/three/')) {
    sendFile(res, THREE_DIR, url.pathname.slice('/vendor/three/'.length), 'public, max-age=604800');
    return;
  }
  sendFile(res, PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname, 'no-cache');
});

// ---------------------------------------------------------------------------
// 2. Live connections
// ---------------------------------------------------------------------------

const io = new Server(server, { maxHttpBufferSize: 300_000 });
const rooms = new Map(); // code -> { game, sockets: Map(socketId -> personId), positions, captainLeftAt, emptySince }

function newRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function personSocket(room, personId) {
  for (const [socketId, id] of room.sockets) if (id === personId) return io.sockets.sockets.get(socketId);
  return null;
}

// Door locks: who is standing inside a room right now, and telling people about the door.
function insideRoom(room, roomId) {
  return Object.entries(room.positions).filter(([id, p]) => p.room === roomId && room.game.get(id)?.connected).map(([id]) => id);
}

function doorNotice(room, ids, payload) {
  for (const id of ids) personSocket(room, id)?.emit('door', payload);
}

// How far a point is from a room's walls (0 when inside).
function distanceToRoom({ x, z }, [x0, z0, x1, z1]) {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}

// Each person gets their own view (secrets stay secret).
function broadcast(room) {
  // a finished game is saved as a replay, once, before anyone gets the final state (so they get its link)
  if (room.game.phase === 'ended' && !room.game.replayId) {
    room.game.replayId = crypto.randomBytes(6).toString('hex');
    records.saveReplay(room.game.replayId, { ...room.game.baseView(), log: [], isReplay: true, savedAt: new Date().toISOString() });
  }
  // a finished game goes into the play stats, once
  if (room.game.winner && room.loggedWin !== room.game.version) {
    room.loggedWin = room.game.version;
    records.saveGame(room.game.summary());
  }
  for (const [socketId, personId] of room.sockets) {
    io.to(socketId).emit('state', room.game.viewFor(personId), Date.now());
  }
}

function isCaptain(room, id) {
  return room.game.captain?.id === id;
}

// Proximity chat: who hears a message, and delivering it (people and robots both use this).
// Who hears a message from this player right now, by phase and position.
function hearersOf(room, g, speakerId) {
  if (['lobby', 'ended', 'dawn', 'meeting', 'nominations', 'lastwords', 'dusk'].includes(g.phase)) return { channel: 'all', ids: [...g.players.map((p) => p.id), ...g.spectators.map((s) => s.id)] };
  // Exploring: only players in the same room or close by hear you.
  const mine = room.positions[speakerId];
  const ids = g.players
    .filter((p) => {
      const pos = room.positions[p.id];
      if (p.id === speakerId) return true;
      if (!mine || !pos) return false;
      const theirLock = g.activeLockdown(pos.room);
      if (theirLock && !theirLock.allowed.includes(speakerId)) return false; // sealed rooms keep sound out too
      // corridors are long, so there only distance counts
      return (pos.room === mine.room && pos.room !== 'corridor') || Math.hypot(pos.x - mine.x, pos.z - mine.z) < NEAR_RADIUS;
    })
    .map((p) => p.id);
  // a sealed room: only the people locked inside hear each other
  const lock = mine && g.activeLockdown(mine.room);
  if (lock) return { channel: 'near', ids: ids.filter((id) => lock.allowed.includes(id) || id === speakerId), room: mine.room };
  return { channel: 'near', ids, room: mine?.room };
}

// Send a public (non-secret-channel) message, handling disguises, blackouts and eavesdroppers.
function deliver(room, g, speakerId, message, { spoofedBy = null } = {}) {
  const now = Date.now();
  const { channel, ids, room: where } = hearersOf(room, g, spoofedBy || speakerId);
  message.channel = channel;
  if (channel === 'near') {
    const as = g.disguiseOf(speakerId, now);
    if (as) message.name = g.get(as).name;
    if (g.blackout(now)) message.name = '???';
  }
  const heard = new Set(ids).size - 1;
  for (const id of new Set(ids)) personSocket(room, id)?.emit('chat', message);
  // the Comms Officer's intercept: words without names
  if (channel === 'near' && where && where !== 'corridor') {
    for (const id of g.listeners(where, now)) {
      if (!ids.includes(id)) personSocket(room, id)?.emit('chat', { ...message, from: null, name: `🎧 ${ROOM_NAMES[where]}`, channel: 'intercept' });
    }
  }
  // the Captain hears everything, and sees through tricks
  if (g.captain) {
    const real = spoofedBy ? `${g.get(spoofedBy).name} as ${message.name}` : message.name !== g.get(speakerId)?.name && g.get(speakerId) ? `${g.get(speakerId).name} as ${message.name}` : message.name;
    personSocket(room, g.captain.id)?.emit('chat', { ...message, name: real });
  }
  return heard;
}

io.on('connection', (socket) => {
  let room = null;
  let me = null; // person id (player or captain)
  let lastChat = 0;
  let lastEmote = 0;
  let lastWhisper = 0;
  let lastReport = 0;
  let lastReact = 0;
  // events that don't count as someone being at the keyboard
  const QUIET_EVENTS = new Set(['rtc', 'voice', 'get-drawing', 'active']);

  // Wrap every handler so a rule error goes back to that person as a message.
  const on = (event, handler, { update = true } = {}) =>
    socket.on(event, (data = {}, reply) => {
      try {
        if (typeof data !== 'object' || data === null) data = {};
        if (room && me && !QUIET_EVENTS.has(event)) room.game.touch(me);
        const result = handler(data);
        if (update && room) broadcast(room);
        if (typeof reply === 'function') reply({ ok: true, ...(result || {}) });
      } catch (err) {
        socket.emit('problem', err.message);
        if (typeof reply === 'function') reply({ ok: false, error: err.message });
      }
    });

  const game = () => {
    if (!room) throw new Error('Join a ship first.');
    return room.game;
  };

  function seat(r, person) {
    room = r;
    me = person.id;
    person.connected = true;
    r.sockets.set(socket.id, person.id);
    r.emptySince = null;
    if (isCaptain(r, me)) r.captainLeftAt = null;
    socket.join(r.code);
    socket.emit('joined', { code: r.code, token: person.token, id: person.id });
    r.game.touch(person.id);
    // Send drawings already on the walls.
    for (const d of r.game.drawings.filter((x) => x.published)) socket.emit('drawing', { id: d.id, data: d.data });
  }

  on('create', ({ name, look, mode, practice }) => {
    if (rooms.size >= MAX_ROOMS) throw new Error('The station is full right now. Try again soon.');
    const g = new Game(newRoomCode(), { mode: mode === 'captain' && !practice ? 'captain' : 'autopilot' });
    if (process.env.NMS_TEST_PACE) g.pace = Number(process.env.NMS_TEST_PACE); // automated tests only: speeds up every timer
    const r = { code: g.code, game: g, sockets: new Map(), positions: {}, captainLeftAt: null, emptySince: null };
    const person = g.mode === 'captain' ? g.addCaptain(name) : g.addPlayer(name, look);
    // practice: you and six robots, at a quick pace
    if (practice) {
      g.practice = true;
      g.pace = Math.min(g.pace, 0.7);
      for (let i = 0; i < 6; i++) g.addBot(person.id);
    }
    rooms.set(g.code, r);
    seat(r, person);
  });
  on('add-bot', () => game().addBot(me));
  on('public', ({ on: value }) => game().setPublic(me, value));
  // the public ships list for the title screen
  on('list-public', () => {
    const ships = [...rooms.values()]
      .filter((r) => r.game.isPublic && !r.game.practice && r.sockets.size > 0)
      .map((r) => r.game.listing())
      .sort((a, b) => (b.phase === 'lobby') - (a.phase === 'lobby') || b.people - a.people) // open lobbies first, then the busiest
      .slice(0, 30);
    return { ships };
  }, { update: false });
  on('remove-bots', () => game().removeBots(me));

  on('join', ({ code, name, token, look }) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) throw new Error('No ship with that code.');
    const g = r.game;
    // Returning after a refresh or a dropped connection: take your seat back.
    if (token) {
      if (g.captain?.token === token) return seat(r, g.captain);
      const back = g.players.find((p) => p.token === token);
      if (back) return seat(r, back);
      const watcher = g.spectators.find((s) => s.token === token);
      if (watcher) return seat(r, watcher);
    }
    // a game is already running: watch from the gallery and join at the next rematch
    if (g.phase !== 'lobby') return seat(r, g.addSpectator(name));
    seat(r, g.addPlayer(name, look));
  });

  on('leave', () => {
    if (!room) return;
    room.sockets.delete(socket.id);
    socket.leave(room.code);
    const p = room.game.get(me);
    if (p) p.connected = false;
    room.game.removePlayer(me);
    const r = room;
    room = null;
    me = null;
    broadcast(r);
  }, { update: false });

  on('look', ({ look }) => game().setCosmetics(me, look));

  // ----- Captain / host controls -----
  on('seat', ({ id, dir }) => game().moveSeat(me, id, dir));
  on('shuffle-seats', () => game().shuffleSeats(me));
  on('pace', ({ pace }) => game().setPace(me, pace));
  on('roles', ({ roles: list }) => game().setCustomRoles(me, list));
  on('kick', ({ id }) => {
    const g = game();
    g.requireController(me);
    if (g.phase !== 'lobby') throw new Error('You can only remove players in the lobby.');
    const s = personSocket(room, id);
    g.removePlayer(id);
    if (s) {
      s.emit('kicked');
      room.sockets.delete(s.id);
      s.leave(room.code);
    }
  });
  on('start', ({ deal, drunkAs }) => {
    game().start(me, Date.now(), { deal: Array.isArray(deal) ? deal : null, drunkAs });
    room.positions = {};
    io.to(room.code).emit('drawings-cleared');
  });
  on('advance', () => game().advance(me));
  on('add-time', ({ seconds }) => game().addTime(me, Math.max(-600, Math.min(600, Number(seconds) || 0))));
  on('pause', () => game().togglePause(me));
  on('auto', ({ on: value }) => game().setAutoAdvance(me, value));
  on('autopilot', () => game().handToAutopilot(me));
  on('reg', ({ role, policy }) => game().setRegPolicy(me, role, policy));
  on('draft-edit', (edit) => game().editDraft(me, edit));
  on('toggle-dead', ({ id }) => game().captainToggleDead(me, id));
  on('clue', ({ kind }) => game().forceClue(me, kind, Date.now()));
  on('say', ({ text }) => {
    game().say(me, text);
    io.to(room.code).emit('bubble', room.game.bubble);
  });
  on('end', ({ winner }) => game().endGame(me, winner));
  on('ship-name', ({ name }) => game().setShipName(me, name));
  // anyone can call a rematch once the game is over: same crew, seats and suits
  on('rematch', () => {
    game().rematch(me, Date.now());
    room.positions = {};
    io.to(room.code).emit('drawings-cleared');
  });
  on('reset', () => {
    game().reset(me);
    room.positions = {};
    io.to(room.code).emit('drawings-cleared');
  });
  on('remove-drawing', ({ id }) => {
    game().removeDrawing(me, id);
    io.to(room.code).emit('drawing-removed', { id });
  });
  on('puppet', ({ id, emote }) => {
    const g = game();
    g.requireController(me);
    if (!CAPTAIN_EMOTES.includes(emote) || !g.get(id)) throw new Error('Unknown emote.');
    io.to(room.code).emit('emote', { id, emote, byCaptain: true });
  }, { update: false });

  // ----- Player actions -----
  on('choose', ({ targets }) => game().submitChoice(me, targets));
  on('nominate', ({ target }) => game().nominate(me, target));
  on('hand', ({ up }) => game().setHand(me, up));
  on('done-speaking', () => game().doneSpeaking(me, Date.now()));
  on('ready', ({ on: value }) => game().setReady(me, !!value));
  on('bio', ({ text }) => game().setBio(me, text));
  on('death-guess', ({ target }) => game().setDeathGuess(me, target));
  // ghosts: a secret bet on the Parasite, and harmless pranks in the room they float in
  on('predict', ({ target }) => game().predict(me, target, Date.now()));
  on('haunt', ({ kind }) => {
    const g = game();
    const where = room.positions[me]?.room;
    const e = g.haunt(me, kind, where, Date.now());
    io.to(room.code).emit('haunt', e);
  });
  // "…" over your head while you type (never at night: the secret channels stay secret)
  on('typing', ({ on: value }) => {
    const g = game();
    if (!g.get(me) || g.phase === 'night') return;
    socket.to(room.code).emit('typing', { id: me, on: !!value });
  }, { update: false });
  // emoji reactions float up from your seat
  on('react', ({ emoji }) => {
    const now = Date.now();
    if (now - lastReact < 450) return;
    lastReact = now;
    game().react(me, emoji);
    io.to(room.code).emit('react', { id: me, emoji });
  }, { update: false });
  // "I'm still here": sent now and then while someone is using the keyboard or mouse
  on('active', () => {
    if (room && me && room.game.touch(me)) broadcast(room);
  }, { update: false });
  on('shoot', ({ target }) => game().gunnerShot(me, target));
  on('task', ({ task }) => game().completeTask(me, task));
  on('drawing', ({ data, signed }) => {
    game().submitDrawing(me, data, signed, Date.now());
  });

  on('emote', ({ emote }) => {
    if (!PLAYER_EMOTES.includes(emote) || !room?.game.get(me)) return;
    const now = Date.now();
    if (now - lastEmote < 1500) return;
    lastEmote = now;
    io.to(room.code).emit('emote', { id: me, emote });
  }, { update: false });


  on('chat', ({ text, channel }) => {
    const g = game();
    const now = Date.now();
    if (now - lastChat < 600) throw new Error('Slow down a little!');
    lastChat = now;
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return;
    const captain = isCaptain(room, me);
    const sender = g.get(me);
    const message = { from: me, name: captain ? `Captain ${g.captain.name}` : sender?.name, text: clean, at: now, ghost: sender ? !sender.alive : false };

    if (channel === 'evil') {
      if (!sender || teamOf(sender.role || 'crew') !== 'infiltrators' || !g.evilInfoShared()) throw new Error('You have no secret channel.');
      if (g.phase !== 'night') throw new Error('The secret channel only opens at night.');
      message.channel = 'evil';
      const ids = g.players.filter((p) => p.role && teamOf(p.role) === 'infiltrators').map((p) => p.id);
      if (g.captain) ids.push(g.captain.id);
      for (const id of new Set(ids)) personSocket(room, id)?.emit('chat', message);
      return { heard: ids.length - 1, channel: 'evil' };
    }
    if (captain) {
      message.channel = 'all';
      for (const id of [...g.players.map((p) => p.id), ...g.spectators.map((s) => s.id), g.captain.id]) personSocket(room, id)?.emit('chat', message);
      return { heard: g.players.length, channel: 'all' };
    }
    // spectators talk in the gallery: other spectators, the dead and the Captain hear them
    const watcher = g.getSpectator(me);
    if (watcher) {
      message.name = `👀 ${watcher.name}`;
      const open = ['lobby', 'ended'].includes(g.phase);
      message.channel = open ? 'all' : 'gallery';
      const ids = open ? [...g.players.map((p) => p.id), ...g.spectators.map((s) => s.id)] : [...g.spectators.map((s) => s.id), ...g.players.filter((p) => !p.alive).map((p) => p.id)];
      if (g.captain) ids.push(g.captain.id);
      for (const id of new Set(ids)) personSocket(room, id)?.emit('chat', message);
      return { heard: new Set(ids).size - 1, channel: message.channel };
    }
    // the dead gossip on their own channel at night
    if (channel === 'ghost') {
      if (!sender || sender.alive) throw new Error('Only the dead can use the ghost channel.');
      if (g.phase !== 'night') throw new Error('The ghost channel opens at night. By day, the living can hear you.');
      message.channel = 'ghost';
      const ids = [...g.players.filter((p) => !p.alive).map((p) => p.id), ...g.spectators.map((s) => s.id)];
      if (g.captain) ids.push(g.captain.id);
      for (const id of new Set(ids)) personSocket(room, id)?.emit('chat', message);
      return { heard: ids.length - 1, channel: 'ghost' };
    }
    if (g.phase === 'night') throw new Error('Shh... everyone is asleep. (Draw something instead!)');
    g.noteChat(me);
    if (g.phase === 'lastwords' && g.lastWords?.id === me) {
      message.lastWords = true;
      g.noteLastWords(me, clean);
    }
    const heard = deliver(room, g, me, message);
    return { heard, channel: message.channel };
  }, { update: false });

  // Public role claims (shown by each seat) and the Captain's ship-wide fun.
  on('claim', ({ role, text }) => game().setClaim(me, role, text));
  on('ship-event', ({ kind }) => game().shipEventStart(me, kind, Date.now()));
  on('stinger', ({ name }) => {
    game().requireController(me);
    if (!STINGERS.includes(name)) throw new Error('Unknown sound.');
    io.to(room.code).emit('stinger', { name });
  }, { update: false });

  // Whisper requests: ask someone for a private chat; if they say yes, the
  // server finds an empty room and beams you both there.
  on('whisper-ask', ({ target }) => {
    const g = game();
    if (g.phase !== 'roam') throw new Error('You can only whisper while exploring.');
    const other = g.get(target);
    if (!other || other.id === me || !g.get(me)) throw new Error('Pick another player.');
    const now = Date.now();
    if (now - lastWhisper < 8000) throw new Error('Give them a moment to answer.');
    lastWhisper = now;
    const s = personSocket(room, other.id);
    if (!s) throw new Error(`${other.name} is offline.`);
    room.whispers ||= new Map();
    room.whispers.set(`${me}>${other.id}`, now);
    s.emit('whisper-invite', { from: me, name: g.get(me).name });
  }, { update: false });
  on('whisper-answer', ({ from, yes }) => {
    const g = game();
    const key = `${from}>${me}`;
    const asked = room.whispers?.get(key);
    room.whispers?.delete(key);
    if (!asked || Date.now() - asked > 30_000) throw new Error('That invitation has expired.');
    const asker = personSocket(room, from);
    if (!yes) {
      asker?.emit('whisper-reply', { name: g.get(me)?.name, yes: false });
      return;
    }
    if (g.phase !== 'roam') throw new Error('Exploring is over.');
    // an empty room (not sealed), preferring quiet corners away from the bridge
    const busy = new Set(Object.values(room.positions).map((p) => p.room));
    const options = ROOM_IDS.filter((r) => r !== 'corridor' && r !== 'bridge' && !busy.has(r) && !g.activeLockdown(r));
    const where = options.length ? options[Math.floor(Math.random() * options.length)] : 'bridge';
    const go = { room: where, with: [from, me] };
    asker?.emit('whisper-go', { ...go, name: g.get(me)?.name });
    socket.emit('whisper-go', { ...go, name: g.get(from)?.name });
  }, { update: false });

  // Bug reports from the in-game button go to data/reports.jsonl for the owner.
  on('bug-report', ({ text, errors, info }) => {
    const now = Date.now();
    if (now - lastReport < 60_000) throw new Error('Thanks! You can send another report in a minute.');
    lastReport = now;
    const clean = String(text || '').trim().slice(0, 2000);
    if (!clean) throw new Error('Tell us what went wrong first.');
    const g = room?.game;
    records.saveReport({
      at: new Date(now).toISOString(),
      text: clean,
      errors: (Array.isArray(errors) ? errors : []).slice(-15).map((e) => String(e).slice(0, 400)),
      info: String(info || '').slice(0, 400),
      game: g ? { code: g.code, phase: g.phase, day: g.day, players: g.players.length, mode: g.mode } : null,
    });
  }, { update: false });

  // ⚡ Ship systems (see roles.js `system`). The server adds what only it knows: where you stand and who is in the room.
  on('system', ({ room: chosen, target, text }) => {
    const g = game();
    const here = room.positions[me]?.room;
    const sys = g.systemFor(g.get(me));
    const which = sys?.target === 'here' ? here : chosen;
    const occupants = Object.entries(room.positions).filter(([, pos]) => pos.room === which).map(([id]) => id);
    const result = g.useSystem(me, { room: chosen, target, text, here, occupants }, Date.now());
    if (result.spoof) {
      const as = g.get(result.spoof.as);
      deliver(room, g, as.id, { from: as.id, name: as.name, text: result.spoof.text, at: Date.now(), ghost: !as.alive }, { spoofedBy: me });
    }
    return {};
  });

  // 🔒 Door locks (see engine.js lockRoom). Where you stand and who is inside come from live positions, never from the client.
  on('lock', () => {
    const g = game();
    const here = room.positions[me]?.room;
    const inside = insideRoom(room, here);
    const lock = g.lockRoom(me, { here, occupants: inside }, Date.now());
    doorNotice(room, inside, { kind: 'locked', room: here, by: g.get(me).name, until: lock.until });
  });
  on('unlock', () => {
    const g = game();
    const here = room.positions[me]?.room;
    g.unlockRoom(me, { here }, Date.now());
    doorNotice(room, insideRoom(room, here), { kind: 'unlocked', room: here, why: 'unlocked', by: g.get(me).name });
  });
  on('knock', ({ room: target }) => {
    const g = game();
    const rect = ROOM_RECTS[target];
    const mine = room.positions[me];
    if (!rect || !mine) throw new Error('Walk up to a locked door first.');
    if (distanceToRoom(mine, rect) > 9) throw new Error('You are too far from that door. Walk up to it first.');
    const lock = g.knock(me, target, Date.now());
    const inside = insideRoom(room, target).filter((id) => lock.allowed.includes(id));
    doorNotice(room, inside, { kind: 'knock', from: me, name: g.get(me).name, room: target });
    return { heard: inside.length };
  });
  on('let-in', ({ id }) => {
    const g = game();
    const here = room.positions[me]?.room;
    g.admit(me, String(id), { here }, Date.now());
    doorNotice(room, [String(id)], { kind: 'opened', room: here, by: g.get(me).name });
  });

  // Movement: stored and relayed ~10 times a second by the loop below.
  socket.on('pos', (data) => {
    if (!room || !room.game.get(me) || !data) return;
    const { x, z, r, m, room: where } = data;
    if (![x, z, r].every(Number.isFinite) || Math.abs(x) > 120 || Math.abs(z) > 120) return;
    let inRoom = ROOM_IDS.includes(where) ? where : 'corridor';
    // a sealed room only holds the people who were inside when it was locked
    const lock = room.game.activeLockdown(inRoom);
    if (lock && !lock.allowed.includes(me)) inRoom = 'corridor';
    room.positions[me] = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 100) / 100, m: m ? 1 : 0, room: inRoom };
    if (m && room.game.touch(me)) broadcast(room); // walking around counts as being here
    room.game.recordVisit(me, inRoom);
    room.posDirty = true;
  });

  // Drawings: images are sent once to each client, not inside every state update.
  on('get-drawing', ({ id }) => {
    const d = game().drawings.find((x) => x.id === id && (x.published || x.author === me));
    if (d) socket.emit('drawing', { id: d.id, data: d.data });
  }, { update: false });

  // Voice chat: the server only passes connection details between two browsers.
  on('rtc', ({ to, data }) => {
    if (!room || !data || JSON.stringify(data).length > 20_000) return;
    const target = personSocket(room, to);
    if (target) target.emit('rtc', { from: me, data });
  }, { update: false });
  on('voice', ({ on: value }) => {
    if (!room) return;
    socket.to(room.code).emit('voice', { id: me, on: !!value });
  }, { update: false });

  socket.on('disconnect', () => {
    if (!room) return;
    room.sockets.delete(socket.id);
    const g = room.game;
    const stillHere = [...room.sockets.values()].includes(me);
    if (!stillHere) {
      if (isCaptain(room, me)) {
        g.captain.connected = false;
        room.captainLeftAt = Date.now();
      } else {
        const p = g.get(me);
        if (p) p.connected = false;
        const watcher = g.getSpectator(me);
        if (watcher) watcher.connected = false;
        // In the lobby, give people 45 seconds to come back (e.g. a page refresh) before freeing their seat.
        if (g.phase === 'lobby') {
          const r = room;
          const id = me;
          setTimeout(() => {
            const again = r.game.get(id);
            if (again && !again.connected && r.game.phase === 'lobby') {
              r.game.removePlayer(id);
              broadcast(r);
            }
          }, 45_000).unref();
        }
      }
      socket.to(room.code).emit('voice', { id: me, on: false });
    }
    if (room.sockets.size === 0) room.emptySince = Date.now();
    broadcast(room);
  });
});

// ---------------------------------------------------------------------------
// Timers: advance phases, run the vote clock, relay movement, tidy up.
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const g = room.game;
    // If the Captain vanishes mid-game for 90 seconds, ARIA takes over.
    if (g.mode === 'captain' && room.captainLeftAt && now - room.captainLeftAt > 90_000 && g.phase !== 'lobby') {
      g.handToAutopilot(g.captain.id);
      g.announce('The Captain lost contact. ARIA, the ship autopilot, has taken command.', 'system');
      room.captainLeftAt = null;
      broadcast(room);
    }
    const botsActed = runBots(room, now, botApi(room));
    // locks end when their time is up or their room has emptied
    const unlocked = g.sweepLocks((r) => insideRoom(room, r), now);
    for (const l of unlocked) doorNotice(room, l.allowed, { kind: 'unlocked', room: l.room, why: l.ended });
    if (g.tick(now) || botsActed || unlocked.length) broadcast(room);
    if (room.emptySince && now - room.emptySince > 10 * 60_000) rooms.delete(code);
  }
}, 250).unref();

setInterval(() => {
  for (const room of rooms.values()) {
    tickBall(room, 0.1);
    if (!room.posDirty) continue;
    room.posDirty = false;
    const packed = {};
    for (const [id, p] of Object.entries(room.positions)) packed[id] = [p.x, p.z, p.r, p.m];
    if (room.ball) packed['@ball'] = [Math.round(room.ball.x * 100) / 100, Math.round(room.ball.z * 100) / 100, Math.round(room.ball.vx * 10) / 10, Math.round(room.ball.vz * 10) / 10];
    io.to(room.game.code).volatile.emit('pos', packed);
  }
}, 100).unref();

// ---------------------------------------------------------------------------
// Robots speak and emote through the same channels as people.
// ---------------------------------------------------------------------------

function botApi(room) {
  return {
    // proximity chat while exploring (only people nearby hear it)
    sayNear(p, text) {
      if (room.game.phase !== 'roam') return;
      room.game.noteChat(p.id);
      deliver(room, room.game, p.id, { from: p.id, name: p.name, text, at: Date.now(), ghost: !p.alive });
    },
    // the Hacker's fake message, sent as someone else
    spoof(byId, asId, text) {
      const as = room.game.get(asId);
      if (as) deliver(room, room.game, as.id, { from: as.id, name: as.name, text, at: Date.now(), ghost: !as.alive }, { spoofedBy: byId });
    },
    haunt(e) {
      io.to(room.code).emit('haunt', e);
    },
    say(p, text, extra = {}) {
      const g = room.game;
      if (!['dawn', 'meeting', 'nominations', 'lastwords', 'dusk', 'lobby', 'ended'].includes(g.phase)) return;
      const message = { from: p.id, name: p.name, text, at: Date.now(), ghost: !p.alive, channel: 'all', ...extra };
      g.noteChat(p.id);
      if (extra.lastWords) g.noteLastWords(p.id, text);
      for (const [socketId] of room.sockets) io.to(socketId).emit('chat', message);
    },
    emote(id, emote) {
      io.to(room.code).emit('emote', { id, emote });
    },
  };
}

// ---------------------------------------------------------------------------
// The docking-bay ball: a giant rubber space duck that people (and robots)
// bump around the bridge while they wait for friends. The server moves it so
// everyone sees the same duck.
// ---------------------------------------------------------------------------

const BALL_R = 0.7;
const BRIDGE_HALF = 10 - 0.3 - BALL_R; // the bridge's square walls (public/js/world/layout.js)
const BRIDGE_DIAG = 20 - 2.4 - (0.3 + BALL_R) * Math.SQRT2; // and its cut corners
const TABLE_R = 3.2 + BALL_R;

function tickBall(room, dt) {
  if (room.game.phase !== 'lobby') {
    room.ball = null;
    return;
  }
  const b = (room.ball ||= { x: 0, z: -6.5, vx: 0, vz: 0 });
  // kicks from anyone touching it (harder if they are running)
  for (const pos of Object.values(room.positions)) {
    const dx = b.x - pos.x;
    const dz = b.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < 1.15) {
      const k = pos.m ? 6.5 : 3;
      b.vx += (dx / d) * k;
      b.vz += (dz / d) * k;
      b.x = pos.x + (dx / d) * 1.15;
      b.z = pos.z + (dz / d) * 1.15;
    }
  }
  const speed = Math.hypot(b.vx, b.vz);
  if (speed > 11) {
    b.vx *= 11 / speed;
    b.vz *= 11 / speed;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.vx *= 0.95;
  b.vz *= 0.95;
  // bounce off the walls
  if (Math.abs(b.x) > BRIDGE_HALF) {
    b.x = Math.sign(b.x) * BRIDGE_HALF;
    b.vx *= -0.8;
  }
  if (Math.abs(b.z) > BRIDGE_HALF) {
    b.z = Math.sign(b.z) * BRIDGE_HALF;
    b.vz *= -0.8;
  }
  const over = Math.abs(b.x) + Math.abs(b.z) - BRIDGE_DIAG;
  if (over > 0) {
    const nx = Math.sign(b.x) / Math.SQRT2;
    const nz = Math.sign(b.z) / Math.SQRT2;
    b.x -= nx * over * Math.SQRT1_2 * 2;
    b.z -= nz * over * Math.SQRT1_2 * 2;
    const vn = b.vx * nx + b.vz * nz;
    if (vn > 0) {
      b.vx -= 1.8 * vn * nx;
      b.vz -= 1.8 * vn * nz;
    }
  }
  // and off the bridge table
  const d = Math.hypot(b.x, b.z);
  if (d < TABLE_R) {
    const nx = d ? b.x / d : 1;
    const nz = d ? b.z / d : 0;
    b.x = nx * TABLE_R;
    b.z = nz * TABLE_R;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= 1.8 * vn * nx;
      b.vz -= 1.8 * vn * nz;
    }
  }
  if (Math.hypot(b.vx, b.vz) > 0.05) room.posDirty = true;
  else {
    b.vx = 0;
    b.vz = 0;
  }
}

// ---------------------------------------------------------------------------
// Restarts: games are saved when the server stops and restored when it
// starts, so a deploy doesn't end anyone's game (see persist.js).
// ---------------------------------------------------------------------------

function restoreGames() {
  const now = Date.now();
  for (const { code, game: g } of persist.load(now)) {
    rooms.set(code, { code, game: g, sockets: new Map(), positions: {}, captainLeftAt: g.captain ? now : null, emptySince: now });
  }
  if (rooms.size) console.log(`Restored ${rooms.size} game(s) from before the restart.`);
}

function shutDown(signal) {
  console.log(`${signal}: saving ${rooms.size} game(s) before stopping.`);
  io.emit('server-restart', { in: 0 });
  persist.save(rooms, { sync: true });
  setTimeout(() => process.exit(0), 300).unref();
}

if (require.main === module) {
  restoreGames();
  process.on('SIGTERM', () => shutDown('SIGTERM'));
  process.on('SIGINT', () => shutDown('SIGINT'));
  setInterval(() => persist.save(rooms), 60_000).unref(); // in case of a crash
}

server.listen(PORT, () => {
  console.log(`No More Space is running at http://localhost:${PORT}`);
});

module.exports = { server, rooms, io };
