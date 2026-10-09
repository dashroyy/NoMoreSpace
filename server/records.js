// Small files the server keeps between restarts, in data/ (never touched by
// deploys):
//   data/stats.jsonl    one line per finished game (no names), for balancing
//   data/reports.jsonl  bug reports sent from the in-game "Report a bug" button
// Read them on the server with:  tail data/reports.jsonl
// or see a summary at /stats (and /reports?token=... if NMS_ADMIN_TOKEN is set).

const fs = require('fs');
const path = require('path');

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
const saveReport = (report) => append(REPORTS_FILE, report);

// The numbers you need for balancing: who wins, how long games take, how roles do.
function statsSummary() {
  const games = readLines(STATS_FILE);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const byPlayers = {};
  const roles = {};
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
      roles[r] ||= { dealt: 0, survived: 0 };
      roles[r].dealt += 1;
    }
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
  };
}

const reports = () => readLines(REPORTS_FILE).slice(-200);

module.exports = { saveGame, saveReport, statsSummary, reports, DATA_DIR };
