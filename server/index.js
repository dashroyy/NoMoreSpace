// The web server. It does two jobs:
//   1. Sends the game's web page (the files in /public) to browsers.
//   2. Keeps a live two-way connection (Socket.IO) with every player so
//      the game updates instantly for everyone.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Room } = require('./game');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_ROOMS = 200; // keeps memory use small on a 1 GB server

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// ---------- 1. serve the web page ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
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
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------- 2. live game connections ----------

const io = new Server(server, { maxHttpBufferSize: 10_000 });
const rooms = new Map(); // code -> Room

function newRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// Send every player in a room their own personal view of the game.
function broadcast(room) {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit('state', room.viewFor(player.id));
  }
}

function deleteRoomIfEmpty(room) {
  if (room.players.every((p) => !p.connected)) rooms.delete(room.code);
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;

  // Wrap each handler so any rule error is sent back to that player as a message.
  const on = (event, handler) =>
    socket.on(event, (data = {}) => {
      try {
        handler(data);
        if (room) broadcast(room);
      } catch (err) {
        socket.emit('problem', err.message);
      }
    });

  function seat(r, p) {
    room = r;
    player = p;
    p.connected = true;
    p.socketId = socket.id;
    socket.emit('joined', { code: r.code, token: p.token });
  }

  on('create', ({ name }) => {
    if (rooms.size >= MAX_ROOMS) throw new Error('The station is full right now. Try again soon.');
    const r = new Room(newRoomCode());
    rooms.set(r.code, r);
    seat(r, r.addPlayer(name));
  });

  on('join', ({ code, name, token }) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) throw new Error('No ship with that code.');
    // A returning player (page refresh, phone locked) gets their old seat back.
    const returning = token && r.players.find((p) => p.token === token);
    seat(r, returning || r.addPlayer(name));
  });

  on('start', () => room?.start(player.id));
  on('night-action', ({ targetId }) => room?.nightAction(player.id, targetId));
  on('vote', ({ targetId }) => room?.vote(player.id, targetId));
  on('end-day', () => room?.endDay(player.id));

  socket.on('disconnect', () => {
    if (!room || !player) return;
    player.connected = false;
    player.socketId = null;
    if (room.phase === 'lobby') room.removePlayer(player.id);
    broadcast(room);
    // Give people a few minutes to reconnect before throwing the room away.
    const r = room;
    setTimeout(() => deleteRoomIfEmpty(r), 5 * 60 * 1000).unref();
  });
});

server.listen(PORT, () => {
  console.log(`No More Space is running at http://localhost:${PORT}`);
});
