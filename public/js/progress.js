// Your progress across games, kept in this browser (no account needed).
// Playing and winning unlocks extra hats and pets for your spacesuit.
import { store } from './store.js';

const KEY = 'nms-progress';

export const UNLOCKS = {
  laurel: { kind: 'hat', label: '🏆 Laurels', hint: 'Win 3 games', ok: (p) => p.wins >= 3, count: (p) => [p.wins, 3] },
  tentacles: { kind: 'hat', label: '🦑 Tentacles', hint: 'Win a game on the evil team', ok: (p) => p.evilWins >= 1 },
  jester: { kind: 'hat', label: '🤡 Jester cap', hint: 'Play as the Holo-Jester', ok: (p) => (p.roles.jester || 0) >= 1 },
  saucer: { kind: 'hat', label: '🛸 Mini UFO', hint: 'Play 5 games', ok: (p) => p.games >= 5, count: (p) => [p.games, 5] },
  whale: { kind: 'pet', label: '🐋 Space whale', hint: 'Win 2 games with the crew', ok: (p) => p.crewWins >= 2, count: (p) => [p.crewWins, 2] },
  crystal: { kind: 'hat', label: '🔮 Crystal ball', hint: 'Get 5 "who dies tonight?" guesses right', ok: (p) => p.guesses >= 5, count: (p) => [p.guesses, 5] },
  psychic: { kind: 'visor', label: '🟣 Psychic visor', hint: 'As a ghost, bet on the real Parasite 3 times', ok: (p) => p.psychicBets >= 3, count: (p) => [p.psychicBets, 3] },
  rubberduck: { kind: 'pet', label: '🐤 Rubber duck', hint: 'Bump the docking-bay duck 50 times', ok: (p) => p.kicks >= 50, count: (p) => [p.kicks, 50] },
};

const FRESH = { games: 0, wins: 0, crewWins: 0, evilWins: 0, crewGames: 0, evilGames: 0, roles: {}, seen: [], streak: 0, bestStreak: 0, awards: {}, guesses: 0, psychicBets: 0, kicks: 0, practice: 0 };

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p === 'object') return { ...structuredClone(FRESH), ...p };
  } catch {}
  return structuredClone(FRESH);
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
  if (team === 'crew') p.crewGames += 1;
  else p.evilGames += 1;
  if (state.practice) p.practice += 1;
  if (team === state.winner) {
    p.wins += 1;
    if (team === 'crew') p.crewWins += 1;
    else p.evilWins += 1;
    p.streak += 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
  } else p.streak = 0;
  for (const a of (state.awards || []).filter((x) => x.id === me.id)) p.awards[a.title] = (p.awards[a.title] || 0) + 1;
  p.guesses += you.guesses || 0;
  // a ghost bet on whoever ended up as the Parasite
  const bet = (state.predictions || []).find((b) => b.id === me.id);
  if (bet && state.players.find((x) => x.id === bet.target)?.role === 'parasite') p.psychicBets += 1;
  save(p);
  return Object.keys(UNLOCKS).filter((id) => isUnlocked(id, p) && !before.includes(id)).map((id) => UNLOCKS[id].label);
}

// Bumping the docking-bay duck (counted in this browser). Returns anything newly unlocked.
export function recordKick() {
  const p = load();
  const before = Object.keys(UNLOCKS).filter((id) => isUnlocked(id, p));
  p.kicks += 1;
  save(p);
  return Object.keys(UNLOCKS).filter((id) => isUnlocked(id, p) && !before.includes(id)).map((id) => UNLOCKS[id].label);
}
