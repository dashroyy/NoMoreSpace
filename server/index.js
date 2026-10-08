// The web server. It:
//   1. Sends the game files (public/ and the Three.js 3D library) to browsers.
//   2. Keeps a live Socket.IO connection with every player, so moves, chat,
//      votes and phase changes show up instantly for everyone.
// All the game rules live in engine.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Game, DEATH_ANIMS } = require('./engine');
const { ROLES, TYPES, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, EVIL_INFO_MIN, teamOf } = require('./roles');
const cosmetics = require('./cosmetics');
const { TASKS } = require('./tasks');

const PORT = process.env.PORT != null ? Number(process.env.PORT) : 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three', 'build');
const MAX_ROOMS = 150;
const NEAR_RADIUS = 7; // proximity chat distance (players in the same room always hear each other)
const ROOM_IDS = ['bridge', 'observation', 'navigation', 'comms', 'medbay', 'galley', 'reactor', 'engine', 'hydroponics', 'airlock', 'quarters', 'cargo', 'corridor'];
const PLAYER_EMOTES = ['wave', 'dance', 'jump', 'spin', 'shrug', 'point', 'cry', 'laugh'];
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

// Each person gets their own view (secrets stay secret).
function broadcast(room) {
  for (const [socketId, personId] of room.sockets) {
    io.to(socketId).emit('state', room.game.viewFor(personId), Date.now());
  }
}

function isCaptain(room, id) {
  return room.game.captain?.id === id;
}

io.on('connection', (socket) => {
  let room = null;
  let me = null; // person id (player or captain)
  let lastChat = 0;
  let lastEmote = 0;

  // Wrap every handler so a rule error goes back to that person as a message.
  const on = (event, handler, { update = true } = {}) =>
    socket.on(event, (data = {}, reply) => {
      try {
        if (typeof data !== 'object' || data === null) data = {};
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
    // Send drawings already on the walls.
    for (const d of r.game.drawings.filter((x) => x.published)) socket.emit('drawing', { id: d.id, data: d.data });
  }

  on('create', ({ name, look, mode }) => {
    if (rooms.size >= MAX_ROOMS) throw new Error('The station is full right now. Try again soon.');
    const g = new Game(newRoomCode(), { mode: mode === 'captain' ? 'captain' : 'autopilot' });
    if (process.env.NMS_TEST_PACE) g.pace = Number(process.env.NMS_TEST_PACE); // automated tests only: speeds up every timer
    const r = { code: g.code, game: g, sockets: new Map(), positions: {}, captainLeftAt: null, emptySince: null };
    const person = g.mode === 'captain' ? g.addCaptain(name) : g.addPlayer(name, look);
    rooms.set(g.code, r);
    seat(r, person);
  });

  on('join', ({ code, name, token, look }) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) throw new Error('No ship with that code.');
    const g = r.game;
    // Returning after a refresh or a dropped connection: take your seat back.
    if (token) {
      if (g.captain?.token === token) return seat(r, g.captain);
      const back = g.players.find((p) => p.token === token);
      if (back) return seat(r, back);
    }
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
  on('clue', ({ kind }) => game().forceClue(me, kind));
  on('say', ({ text }) => {
    game().say(me, text);
    io.to(room.code).emit('bubble', room.game.bubble);
  });
  on('end', ({ winner }) => game().endGame(me, winner));
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
  on('shoot', ({ target }) => game().gunnerShot(me, target));
  on('task', ({ task }) => game().completeTask(me, task));
  on('drawing', ({ data, signed }) => {
    game().submitDrawing(me, data, signed);
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

    // Who hears it?
    let recipients;
    if (channel === 'evil') {
      if (!sender || teamOf(sender.role || 'crew') !== 'infiltrators' || !g.evilInfoShared()) throw new Error('You have no secret channel.');
      if (g.phase !== 'night') throw new Error('The secret channel only opens at night.');
      message.channel = 'evil';
      recipients = g.players.filter((p) => p.role && teamOf(p.role) === 'infiltrators').map((p) => p.id);
    } else if (captain || ['lobby', 'ended', 'dawn', 'meeting', 'nominations', 'dusk'].includes(g.phase)) {
      message.channel = 'all';
      recipients = [...g.players.map((p) => p.id)];
    } else if (g.phase === 'night') {
      throw new Error('Shh... everyone is asleep. (Draw something instead!)');
    } else {
      // Roaming: only players in the same room or close by hear you.
      message.channel = 'near';
      const mine = room.positions[me];
      recipients = g.players
        .filter((p) => {
          const pos = room.positions[p.id];
          if (p.id === me) return true;
          if (!mine || !pos) return false;
          // corridors are long, so there only distance counts
          return (pos.room === mine.room && pos.room !== 'corridor') || Math.hypot(pos.x - mine.x, pos.z - mine.z) < NEAR_RADIUS;
        })
        .map((p) => p.id);
    }
    const heard = new Set(recipients).size - 1; // everyone except you
    if (g.captain) recipients.push(g.captain.id); // the Captain hears everything
    for (const id of new Set(recipients)) {
      const s = personSocket(room, id);
      if (s) s.emit('chat', message);
    }
    return { heard, channel: message.channel };
  }, { update: false });

  // Movement: stored and relayed ~10 times a second by the loop below.
  socket.on('pos', (data) => {
    if (!room || !room.game.get(me) || !data) return;
    const { x, z, r, m, room: where } = data;
    if (![x, z, r].every(Number.isFinite) || Math.abs(x) > 120 || Math.abs(z) > 120) return;
    room.positions[me] = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 100) / 100, m: m ? 1 : 0, room: ROOM_IDS.includes(where) ? where : 'corridor' };
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
    if (g.tick(now)) broadcast(room);
    if (room.emptySince && now - room.emptySince > 10 * 60_000) rooms.delete(code);
  }
}, 250).unref();

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.posDirty) continue;
    room.posDirty = false;
    const packed = {};
    for (const [id, p] of Object.entries(room.positions)) packed[id] = [p.x, p.z, p.r, p.m];
    io.to(room.game.code).volatile.emit('pos', packed);
  }
}, 100).unref();

server.listen(PORT, () => {
  console.log(`No More Space is running at http://localhost:${PORT}`);
});

module.exports = { server, rooms, io };
