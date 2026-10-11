// Phase to Space: the live connections.
//
// It runs next to No More Space on the same server, but on its own Socket.IO namespace ("/phase") and
// with its own list of tables, so the two games can never get in each other's way. The rules are in
// engine.js; this file only seats people, passes their answers along and tells everyone what changed.

const { PhaseGame, MAX_PLAYERS, EMOTES } = require('./engine');
const { CLIENT_DATA } = require('./cards');

const MAX_TABLES = 120;
const EMPTY_FOR_MS = 10 * 60_000; // a table nobody has been at for this long is cleared away
const ABANDONED_MS = 3 * 60_000; // a started game with nobody connected for this long is stopped

const rooms = new Map(); // code -> { code, game, sockets: Map(socketId -> personId), emptySince, dirty, timer }

function newCode(isTaken) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code) || isTaken(code));
  return code;
}

function attach(io, { isCodeTaken = () => false } = {}) {
  const nsp = io.of('/phase');

  function socketOf(room, personId) {
    for (const [socketId, id] of room.sockets) if (id === personId) return nsp.sockets.get(socketId);
    return null;
  }

  // Everyone gets their own view (other people's hands stay hidden). Several changes in a row are sent as one.
  function broadcast(room) {
    room.dirty = true;
    if (room.timer) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      if (!room.dirty) return;
      room.dirty = false;
      for (const [socketId, personId] of room.sockets) nsp.to(socketId).emit('state', room.game.viewFor(personId), Date.now());
    }, 30);
    room.timer.unref?.();
  }

  function makeRoom(opts = {}) {
    if (rooms.size >= MAX_TABLES) throw new Error('All the tables are busy right now. Try again soon.');
    const game = new PhaseGame(newCode(isCodeTaken), opts);
    const room = { code: game.code, game, sockets: new Map(), emptySince: null, dirty: false, timer: null, lastChat: new Map() };
    game.onChange = () => broadcast(room);
    rooms.set(game.code, room);
    return room;
  }

  nsp.on('connection', (socket) => {
    let room = null;
    let me = null;
    let lastChat = 0;
    let lastEmote = 0;

    // Every handler: errors go back to just that person, state is sent after.
    const on = (event, handler) =>
      socket.on(event, (data = {}, reply) => {
        try {
          if (typeof data !== 'object' || data === null) data = {};
          const result = handler(data);
          if (typeof reply === 'function') reply({ ok: true, ...(result || {}) });
        } catch (err) {
          socket.emit('problem', err.message);
          if (typeof reply === 'function') reply({ ok: false, error: err.message });
        }
      });

    const game = () => {
      if (!room) throw new Error('Join a table first.');
      return room.game;
    };

    function seat(r, person) {
      room = r;
      me = person.id;
      person.connected = true;
      if (person.afk !== undefined) person.afk = false;
      r.sockets.set(socket.id, person.id);
      r.emptySince = null;
      socket.join(r.code);
      socket.emit('joined', { code: r.code, token: person.token, id: person.id });
      r.game.changed();
    }

    on('create', ({ name, practice, bots, speed }) => {
      const r = makeRoom(process.env.PTS_TEST_PACE ? { pace: Number(process.env.PTS_TEST_PACE) } : {});
      const g = r.game;
      const person = g.addPlayer(name);
      if (['chill', 'normal', 'quick'].includes(speed)) g.settings.speed = speed;
      seat(r, person);
      if (practice) {
        g.practice = true;
        const n = Math.max(1, Math.min(MAX_PLAYERS - 1, Number(bots) || 3));
        for (let i = 0; i < n; i++) g.addBot(person.id);
        g.start(person.id);
      }
    });

    on('join', ({ code, name, token }) => {
      const r = rooms.get(String(code || '').toUpperCase().trim());
      if (!r) throw new Error('No table with that code.');
      const g = r.game;
      if (token) {
        const back = g.players.find((p) => p.token === token) || g.spectators.find((s) => s.token === token);
        if (back) return seat(r, back);
      }
      if (g.phase !== 'lobby' || g.players.length >= MAX_PLAYERS) return seat(r, g.addSpectator(name));
      seat(r, g.addPlayer(name));
    });

    on('leave', () => {
      if (!room) return;
      const r = room;
      r.sockets.delete(socket.id);
      socket.leave(r.code);
      r.game.removePlayer(me);
      room = null;
      me = null;
      if (![...r.sockets.values()].length) r.emptySince = Date.now();
      broadcast(r);
    });

    on('add-bot', () => {
      game().addBot(me);
    });
    on('remove-bot', ({ id }) => {
      const g = game();
      g.requireHost(me);
      if (g.phase !== 'lobby') throw new Error('Only in the lobby.');
      if (g.get(String(id))?.isBot) g.removePlayer(String(id));
    });
    on('kick', ({ id }) => {
      const g = game();
      g.requireHost(me);
      if (g.phase !== 'lobby') throw new Error('Only in the lobby.');
      const s = socketOf(room, String(id));
      g.removePlayer(String(id));
      if (s) {
        s.emit('kicked');
        room.sockets.delete(s.id);
        s.leave(room.code);
      }
    });
    on('speed', ({ speed }) => game().setSpeed(me, String(speed)));
    on('wake', () => game().wake(me));
    on('rename', ({ name }) => game().rename(me, name));
    on('start', () => game().start(me));
    on('rematch', () => game().toLobby(me));

    // an answer to a question the game asked
    on('respond', ({ rid, answer }) => {
      const err = game().respond(me, String(rid), answer && typeof answer === 'object' ? answer : {});
      if (err) throw new Error(err);
    });

    on('chat', ({ text }) => {
      const now = Date.now();
      if (now - lastChat < 600) return;
      lastChat = now;
      game().addChat(me, text);
    });
    on('emote', ({ emote }) => {
      const now = Date.now();
      if (now - lastEmote < 800 || !EMOTES.includes(emote)) return;
      lastEmote = now;
      game().emote(me, emote);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      const r = room;
      r.sockets.delete(socket.id);
      const stillHere = [...r.sockets.values()].includes(me);
      if (!stillHere) {
        const g = r.game;
        const p = g.get(me);
        if (p) p.connected = false;
        const watcher = g.spectators.find((s) => s.id === me);
        if (watcher) watcher.connected = false;
        // in the lobby, give people 45 seconds to come back (a page refresh) before freeing their seat
        if (g.phase === 'lobby' && p) {
          const id = me;
          setTimeout(() => {
            const again = r.game.get(id);
            if (again && !again.connected && r.game.phase === 'lobby') r.game.removePlayer(id);
          }, 45_000).unref();
        }
        // everyone left: if the host went, pass the host's job on
        if (g.hostId === me && g.phase !== 'lobby') {
          const next = g.players.find((x) => !x.isBot && x.connected && x.id !== me);
          if (next) g.hostId = next.id;
        }
      }
      if (![...r.sockets.values()].length) r.emptySince = Date.now();
      broadcast(r);
    });
  });

  // Tidy up: clear empty tables, and stop started games nobody is playing any more.
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const g = room.game;
      const people = g.players.filter((p) => !p.isBot && p.connected).length + g.spectators.filter((s) => s.connected).length;
      if (people === 0 && !room.emptySince) room.emptySince = now;
      if (people > 0) room.emptySince = null;
      const limit = g.phase === 'lobby' || g.phase === 'ended' ? EMPTY_FOR_MS : ABANDONED_MS;
      if (room.emptySince && now - room.emptySince > limit) {
        g.destroy();
        rooms.delete(code);
      }
    }
  }, 15_000).unref();

  return {
    rooms,
    // for the title page: how busy is it?
    stats() {
      let people = 0;
      let playing = 0;
      for (const { game: g } of rooms.values()) {
        people += g.players.filter((p) => !p.isBot && p.connected).length;
        if (g.phase === 'playing' || g.phase === 'captains') playing += 1;
      }
      return { tables: rooms.size, people, playing };
    },
  };
}

module.exports = { attach, rooms, CLIENT_DATA_JSON: JSON.stringify(CLIENT_DATA) };
