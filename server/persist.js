// Games survive server restarts (every deploy restarts the server).
// The server writes every running game to data/rooms.json when it shuts down
// (and once a minute, in case of a crash) and reads them back on start-up.
// Players' pages reconnect on their own and take their seats back with the
// token their browser kept, so a game carries on where it left off.

const fs = require('fs');
const path = require('path');
const { Game } = require('./engine');

const DATA_DIR = process.env.NMS_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'rooms.json');
const MAX_AGE_MS = 30 * 60_000; // a save older than this is stale: start fresh

// JSON has no Sets or functions: Sets become { __set: [...] }, functions are dropped.
function replacer(key, value) {
  if (value instanceof Set) return { __set: [...value] };
  if (typeof value === 'function') return undefined;
  return value;
}

function reviver(key, value) {
  return value && typeof value === 'object' && Array.isArray(value.__set) ? new Set(value.__set) : value;
}

function serialize(rooms, now = Date.now()) {
  return JSON.stringify({ savedAt: now, rooms: [...rooms.values()].map((r) => ({ code: r.code, game: r.game })) }, replacer);
}

// Turn saved JSON back into live games. Timers are moved on by however long
// the server was down, so nobody loses the rest of their turn.
function deserialize(text, now = Date.now()) {
  const data = JSON.parse(text, reviver);
  if (!data || !Array.isArray(data.rooms) || now - data.savedAt > MAX_AGE_MS) return [];
  const down = Math.max(0, now - data.savedAt);
  const shift = (obj, key) => {
    if (obj && typeof obj[key] === 'number') obj[key] += down;
  };
  return data.rooms.map(({ code, game: saved }) => {
    const g = Object.assign(Object.create(Game.prototype), saved);
    g.random = Math.random;
    shift(g, 'phaseEndsAt');
    shift(g, 'phaseStartedAt');
    shift(g.nomination, 'stageEndsAt');
    shift(g.blackbox, 'deadline');
    shift(g.clue, 'at');
    shift(g.hallucination?.clue, 'at');
    // JSON copies objects, so the current chapter must point back into the history again
    if (g.chapter) g.chapter = [...g.history].reverse().find((h) => h.k === 'night' || h.k === 'day') || null;
    // short-lived effects simply end
    g.shipEvent = null;
    g.resetSystems();
    g.script ||= 'classic'; // saves from before scripts existed
    g.twin ??= null;
    g.hexed ??= null;
    g.wish ??= null;
    g.activeFloor = now;
    g.afk = new Set();
    for (const p of g.players) {
      p.connected = !!p.isBot; // people reconnect by themselves; robots never left
      p.lastActive = now;
    }
    if (g.captain) g.captain.connected = false;
    for (const s of g.spectators || []) s.connected = false;
    return { code, game: g };
  });
}

function save(rooms, { sync = false } = {}) {
  if (!rooms.size) {
    try {
      fs.rmSync(FILE, { force: true });
    } catch {}
    return;
  }
  const text = serialize(rooms);
  const tmp = `${FILE}.tmp`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (sync) {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, FILE);
    } else {
      fs.promises.writeFile(tmp, text).then(() => fs.promises.rename(tmp, FILE)).catch((err) => console.error('Could not save games:', err.message));
    }
  } catch (err) {
    console.error('Could not save games:', err.message);
  }
}

function load(now = Date.now()) {
  try {
    if (!fs.existsSync(FILE)) return [];
    return deserialize(fs.readFileSync(FILE, 'utf8'), now);
  } catch (err) {
    console.error('Could not restore saved games:', err.message);
    return [];
  }
}

module.exports = { serialize, deserialize, save, load, FILE };
