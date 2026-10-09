// Your progress across games, kept in this browser (no account needed).
// Playing and winning unlocks extra hats and pets for your spacesuit.
import { store } from './store.js';

const KEY = 'nms-progress';

export const UNLOCKS = {
  laurel: { kind: 'hat', label: '🏆 Laurels', hint: 'Win 3 games', ok: (p) => p.wins >= 3 },
  tentacles: { kind: 'hat', label: '🦑 Tentacles', hint: 'Win a game on the evil team', ok: (p) => p.evilWins >= 1 },
  jester: { kind: 'hat', label: '🤡 Jester cap', hint: 'Play as the Holo-Jester', ok: (p) => (p.roles.jester || 0) >= 1 },
  saucer: { kind: 'hat', label: '🛸 Mini UFO', hint: 'Play 5 games', ok: (p) => p.games >= 5 },
  whale: { kind: 'pet', label: '🐋 Space whale', hint: 'Win 2 games with the crew', ok: (p) => p.crewWins >= 2 },
};

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p === 'object') return { games: 0, wins: 0, crewWins: 0, evilWins: 0, roles: {}, seen: [], ...p };
  } catch {}
  return { games: 0, wins: 0, crewWins: 0, evilWins: 0, roles: {}, seen: [] };
}

function save(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function progress() {
  return load();
}

export function isUnlocked(id, p = load()) {
  const u = UNLOCKS[id];
  return !u || u.ok(p);
}

// Called when a game ends. Returns the labels of anything newly unlocked.
export function recordGame(state) {
  const you = state.you;
  const me = state.players.find((x) => x.id === you?.id);
  if (!me?.role || !state.winner || you.isCaptain) return [];
  const p = load();
  const key = `${state.code}:${state.day}:${state.winner}:${state.players.map((x) => x.role).join(',')}`;
  if (p.seen.includes(key)) return [];
  const before = Object.keys(UNLOCKS).filter((id) => isUnlocked(id, p));
  p.seen = [...p.seen.slice(-30), key];
  p.games += 1;
  p.roles[me.role] = (p.roles[me.role] || 0) + 1;
  const team = store.data.types[store.data.roles[me.role].type].team;
  if (team === state.winner) {
    p.wins += 1;
    if (team === 'crew') p.crewWins += 1;
    else p.evilWins += 1;
  }
  save(p);
  return Object.keys(UNLOCKS).filter((id) => isUnlocked(id, p) && !before.includes(id)).map((id) => UNLOCKS[id].label);
}
