// Small files the server keeps between restarts, in data/ (never touched by
// deploys):
//   data/stats.jsonl    one line per finished game (no names), for balancing
//   data/reports.jsonl  bug reports sent from the in-game "Report a bug" button
// Read them on the server with:  tail data/reports.jsonl
// or see a summary at /stats (and /reports?token=... if NMS_ADMIN_TOKEN is set).

const fs = require('fs');
const path = require('path');
const { ROLES, teamOf } = require('./roles');

const DATA_DIR = process.env.NMS_DATA_DIR || path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.jsonl');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.jsonl');
const MAX_FILE_BYTES = 20 * 1024 * 1024; // stop writing if a file grows silly

function append(file, record) {
  fs.promises
    .mkdir(DATA_DIR, { recursive: true })
    .then(() => fs.promises.stat(file).catch(() => ({ size: 0 })))
    .then((st) => (st.size < MAX_FILE_BYTES ? fs.promises.appendFile(file, `${JSON.stringify(record)}\n`) : null))
    .catch((err) => console.error('Could not save record:', err.message));
}

function readLines(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const saveGame = (summary) => append(STATS_FILE, summary);

// Finished games, saved so anyone can rewatch the end-game reveal from a link.
const REPLAY_DIR = path.join(DATA_DIR, 'replays');
const MAX_REPLAYS = 500;

function saveReplay(id, replay) {
  const file = path.join(REPLAY_DIR, `${id}.json`);
  fs.promises
    .mkdir(REPLAY_DIR, { recursive: true })
    .then(() => fs.promises.writeFile(file, JSON.stringify(replay)))
    .then(() => fs.promises.readdir(REPLAY_DIR))
    .then(async (names) => {
      if (names.length <= MAX_REPLAYS) return;
      // keep the newest ones
      const files = await Promise.all(names.map(async (n) => ({ n, t: (await fs.promises.stat(path.join(REPLAY_DIR, n))).mtimeMs })));
      files.sort((a, b) => a.t - b.t);
      for (const f of files.slice(0, files.length - MAX_REPLAYS)) await fs.promises.rm(path.join(REPLAY_DIR, f.n), { force: true });
    })
    .catch((err) => console.error('Could not save replay:', err.message));
}

function readReplay(id) {
  if (!/^[a-f0-9]{12}$/.test(String(id))) return null;
  try {
    return fs.readFileSync(path.join(REPLAY_DIR, `${id}.json`), 'utf8');
  } catch {
    return null;
  }
}
const saveReport = (report) => append(REPORTS_FILE, report);

// The numbers you need for balancing: who wins, how long games take, how roles do.
function statsSummary() {
  const games = readLines(STATS_FILE);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const byPlayers = {};
  const roles = {};
  const perDay = {};
  let minutes = 0;
  let crewWins = 0;
  for (const g of games) {
    const k = String(g.players);
    byPlayers[k] ||= { games: 0, crewWins: 0 };
    byPlayers[k].games += 1;
    if (g.winner === 'crew') {
      byPlayers[k].crewWins += 1;
      crewWins += 1;
    }
    minutes += g.minutes || 0;
    for (const r of g.roles || []) {
      roles[r] ||= { dealt: 0, survived: 0, wins: 0, name: ROLES[r]?.name || r, icon: ROLES[r]?.icon || '', type: ROLES[r]?.type || '' };
      roles[r].dealt += 1;
      if (ROLES[r] && teamOf(r) === g.winner) roles[r].wins += 1;
    }
    const day = String(g.at || '').slice(0, 10);
    if (day) perDay[day] = (perDay[day] || 0) + 1;
    for (const r of g.survivors || []) if (roles[r]) roles[r].survived += 1;
  }
  for (const v of Object.values(byPlayers)) v.crewWinPercent = pct(v.crewWins, v.games);
  return {
    games: games.length,
    crewWinPercent: pct(crewWins, games.length),
    averageMinutes: games.length ? Math.round(minutes / games.length) : null,
    byPlayerCount: byPlayers,
    roles,
    recent: games.slice(-10),
    perDay: Object.fromEntries(Object.entries(perDay).sort().slice(-21)),
    replays: (() => {
      try {
        return fs.readdirSync(REPLAY_DIR).length;
      } catch {
        return 0;
      }
    })(),
  };
}

const reports = () => readLines(REPORTS_FILE).slice(-200);

module.exports = { saveGame, saveReport, statsSummary, reports, DATA_DIR, saveReplay, readReplay };
